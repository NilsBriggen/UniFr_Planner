import { describe, expect, it } from "vitest";
import manifest from "../../../data/programmes/reviews/2026-09-26-programme-names.json";
import {
  composeDegree,
  foldSearch,
  programmeNames,
  programmeTitle,
  type DegreeSelection,
  type RecipeRegistry,
} from "../src/recipes";
import { recipeRegistry } from "../src/registry";
import { flattenRequirements } from "../src/requirements";
import type { RequirementNode } from "../src/requirements";

const children = (node: RequirementNode) =>
  "children" in node ? node.children : [];
const programme = (id: string) =>
  recipeRegistry.programmes.find((p) => p.id === id)!;
const reviewed = (id: string, language: "de" | "fr") =>
  manifest.documents.find(
    (d) =>
      d.programmeId === id && d.lang === language && d.status === "resolved",
  )?.name;

describe("official programme names", () => {
  it.each([
    ["bachelor-sci-mathematics", "Mathematik", "Mathématiques"],
    ["bachelor-digitinf-informatics", "Informatik", "Informatique"],
    ["bachelor-eco-management", "Betriebswirtschaftslehre", "Management"],
    ["bachelor-eco-economics", "Volkswirtschaftslehre", "Économie politique"],
    ["master-ius-law", "Rechtswissenschaft", "Droit"],
    ["master-ius-lawparttime", "Rechtswissenschaft", "Droit"],
    ["bachelor-soc-sociologyfrench", "Soziologie (FR)", "Sociologie"],
    ["bachelor-soc-sociologygerman", "Soziologie", "Sociologie (DE)"],
    [
      "master-theo-canonicallicence",
      "Theologie (Kanonisches Lizentiat)",
      "Théologie (Licence canonique)",
    ],
    [
      "bachelor-teach-teacheredu1",
      "Ausbildung für den Unterricht auf der Sekundarstufe I",
      "Formation à l'enseignement pour le degré secondaire I",
    ],
    [
      "master-com-mediacommunicationgerman",
      "Digital Media & Communication for Social Impact",
      "Digital Media & Communication for Social Impact",
    ],
  ])("%s is %s / %s as reviewed", (id, de, fr) => {
    expect([reviewed(id, "de"), reviewed(id, "fr")]).toEqual([de, fr]);
    expect(programmeTitle(programme(id), "de")).toBe(de);
    expect(programmeTitle(programme(id), "fr")).toBe(fr);
    expect(programmeTitle(programme(id), "en")).toBe(programme(id).title);
  });

  it("falls back to the English title where no official name is known", () => {
    expect(programmeTitle({ title: "Law" }, "de")).toBe("Law");
    expect(
      programmeTitle({ title: "Law", titles: { fr: "Droit" } }, "de"),
    ).toBe("Law");
  });

  it("keeps duplicate official names exactly as published", () => {
    const groups = new Map<string, string[]>();
    for (const p of recipeRegistry.programmes)
      for (const language of ["de", "fr"] as const) {
        const key = `${p.degree} ${language} ${programmeTitle(p, language)}`;
        groups.set(key, [...(groups.get(key) ?? []), p.id]);
      }
    const duplicates = [...groups]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => `${key}: ${ids.join(", ")}`)
      .sort();
    expect(duplicates).toEqual(
      manifest.duplicates
        .map(
          (d) =>
            `${d.degree} ${d.lang} ${d.name}: ${d.programmeIds.join(", ")}`,
        )
        .sort(),
    );
    expect(duplicates).toEqual(EXPECTED_DUPLICATES);
  });

  it("offers curated abbreviations for search only", () => {
    for (const id of ["bachelor-eco-management", "master-eco-management"])
      expect(programme(id).aliases).toEqual(["BWL"]);
    for (const id of ["bachelor-eco-economics", "master-eco-economics"])
      expect(programme(id).aliases).toEqual(["VWL"]);
    expect(programmeNames(programme("master-eco-management"))).toEqual([
      "Management",
      "Betriebswirtschaftslehre",
      "BWL",
    ]);
  });
});

describe("search folding", () => {
  it("ignores case, accents, ligatures, sharp s, apostrophes and spacing", () => {
    expect(foldSearch("  Économie   politique ")).toBe("economie politique");
    expect(foldSearch("Mathématiques")).toBe(foldSearch("MATHEMATIQUES"));
    expect(foldSearch("Straße")).toBe("strasse");
    expect(foldSearch("Œuvre d’Æsop")).toBe("oeuvre d'aesop");
    expect(foldSearch("Formation à l’enseignement")).toBe(
      foldSearch("formation a l'enseignement"),
    );
  });

  it("lists each distinct name once, English first", () => {
    expect(
      programmeNames({
        title: "Management",
        titles: { de: "Betriebswirtschaftslehre", fr: "Management" },
        aliases: ["BWL"],
      }),
    ).toEqual(["Management", "Betriebswirtschaftslehre", "BWL"]);
    expect(programmeNames({ title: "Law" })).toEqual(["Law"]);
  });
});

describe("composed degrees", () => {
  const edition = recipeRegistry.edition;
  const withoutNames = (registry: RecipeRegistry): RecipeRegistry => ({
    ...registry,
    programmes: registry.programmes.map((p) => {
      const copy = { ...p };
      delete copy.titles;
      delete copy.aliases;
      return copy;
    }),
  });
  const ids = (registry: RecipeRegistry, selection: DegreeSelection) =>
    flattenRequirements(composeDegree(registry, selection).root).map(
      (n) => n.id,
    );
  const csMaths: DegreeSelection = {
    structureId: "ba-120-60",
    components: [
      {
        slotId: "major",
        programmeId: "bachelor-digitinf-informatics",
        variantId: "major-120",
        startSemester: "AS-2026",
        recipeVersion: edition,
      },
      {
        slotId: "minor",
        programmeId: "bachelor-sci-mathematics",
        variantId: "minor-60",
        startSemester: "AS-2026",
        recipeVersion: edition,
      },
    ],
  };
  const management: DegreeSelection = {
    structureId: "ba-180",
    components: [
      {
        slotId: "major",
        programmeId: "bachelor-eco-management",
        variantId: "major-180",
        startSemester: "AS-2026",
        recipeVersion: edition,
      },
    ],
  };

  it("labels component groups with localized titles and matching explanations", () => {
    const [major, minor] = children(
      composeDegree(recipeRegistry, csMaths).root,
    );
    expect(major.id).toBe(`bachelor-digitinf-informatics/major-120@${edition}`);
    expect(major.title).toEqual({
      de: "Informatik",
      fr: "Informatique",
      en: "Computer Science",
    });
    expect(major.explanation).toEqual(major.title);
    expect(minor.title).toEqual({
      de: "Mathematik",
      fr: "Mathématiques",
      en: "Mathematics",
    });
  });

  it("keeps the gap explanation on unresolved components", () => {
    const [wrapper] = children(composeDegree(recipeRegistry, management).root);
    const [unresolved] = children(wrapper);
    expect(unresolved.id).toBe(
      `bachelor-eco-management/major-180@${edition}/unresolved`,
    );
    expect(unresolved.title).toEqual({
      de: "Betriebswirtschaftslehre",
      fr: "Management",
      en: "Management",
    });
    expect(unresolved.explanation.en).toBe(
      "Requirement evidence needs clarification",
    );
  });

  it("never changes requirement node ids", () => {
    for (const selection of [csMaths, management])
      expect(ids(recipeRegistry, selection)).toEqual(
        ids(withoutNames(recipeRegistry), selection),
      );
  });
});

// Official names shared within a degree, as UniFr publishes them (2026-09-26 review).
// A new collision must be noticed here, not silently shown in the chooser.
const EXPECTED_DUPLICATES = [
  "master de Digital Media & Communication for Social Impact: master-com-mediacommunicationgerman, master-com-mediacommunicationfrench",
  "master de Kultur, Politik und Religion in der pluralistischen Gesellschaft: master-soc-sociologyfrench, master-soc-religiousstudies, master-soc-socialanthropology",
  "master de Rechtswissenschaft: master-ius-law, master-ius-lawparttime",
  "master de Sonderpädagogik: master-pedpsy-specialeducation, master-pedpsy-speechtherapy, master-pedpsy-specialeduminor",
  "master de Soziologie, Sozialpolitik, Sozialarbeit: master-soc-sociologygerman, master-soc-socialworkgerman",
  "master fr Digital Media & Communication for Social Impact: master-com-mediacommunicationgerman, master-com-mediacommunicationfrench",
  "master fr Droit: master-ius-law, master-ius-lawparttime",
  "master fr Pédagogie spécialisée: master-pedpsy-specialeducation, master-pedpsy-speechtherapy, master-pedpsy-specialeduminor",
  "master fr Sociologie, politiques sociales, travail social: master-soc-sociologygerman, master-soc-socialworkgerman",
  "master fr Sociétés plurielles: cultures, politique et religions: master-soc-sociologyfrench, master-soc-religiousstudies, master-soc-socialanthropology",
];
