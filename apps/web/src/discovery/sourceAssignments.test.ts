import { expect, it } from "vitest";
import { createPlan } from "../planner/domain";
import {
  sourceAssignmentMatches,
  sourceAssignmentApplicability,
  sourceStage,
  stagePriority,
} from "./sourceAssignments";

const plan = (
  programmeId: string,
  variantId: string,
  startSemester = "AS-2026",
) => {
  const value = createPlan({
    id: "p",
    scenarioId: "s",
    name: "Study",
    programme: "Study",
    startTerm: startSemester,
    semesterCount: 2,
    targetEcts: 180,
  });
  value.degreeSelection = {
    structureId: "ba-120-60",
    components: [
      {
        slotId: "minor",
        programmeId,
        variantId,
        startSemester,
        recipeVersion: "2026-27.1",
      },
    ],
  };
  return value;
};

it("finds a Mathematics 60 source assignment but does not treat its major assignment as a minor", () => {
  const assignment = {
    programme: "Mathematics 60 (MATH 60)",
    version: "2026_1/V_01",
    paths: [
      "Mathematics (MATH 60), minor 60 (from AS2020 on) > Mathematics, minor MATH60, compulsory courses (from AS2026 on)",
    ],
  };
  expect(
    sourceAssignmentMatches(plan("bachelor-sci-mathematics", "minor-60"), [
      assignment,
    ]),
  ).toEqual([assignment]);
  expect(
    sourceAssignmentMatches(plan("bachelor-sci-mathematics", "major-120"), [
      assignment,
    ]),
  ).toEqual([]);
  expect(
    sourceAssignmentMatches(
      plan("bachelor-sci-mathematics", "minor-60", "AS-2025"),
      [assignment],
    ),
  ).toEqual([assignment]);
  expect(
    sourceAssignmentApplicability(
      plan("bachelor-sci-mathematics", "minor-60", "AS-2025"),
      assignment,
    ),
  ).toBe("unconfirmed");
});

it("keeps an older transfer's Biology matches visible with applicability unconfirmed", () => {
  const assignment = {
    programme: "Biology 120",
    version: "2025_1/V_01",
    paths: ["BSc in Biology, Major, 2nd-3rd year (from AS2025 on)"],
  };
  const transfer = plan("bachelor-sci-biology", "major-120", "AS-2024");
  expect(sourceAssignmentMatches(transfer, [assignment])).toEqual([assignment]);
  expect(sourceAssignmentApplicability(transfer, assignment)).toBe(
    "unconfirmed",
  );
});

it("maps audited Master, minor and language assignments by exact identity", () => {
  const cases = [
    [
      "master-digitinf-informatics",
      "major-90",
      "MSc in Computer science (BeNeFri)",
      "2023_1/V_01",
    ],
    [
      "master-eco-economics",
      "major-90",
      "Ma - Economics - 90 ECTS",
      "2021-SA_V05 - Dès le SA-2025",
    ],
    ["bachelor-sci-chemistry", "minor-60", "Chemistry 60", "2025_1/V_01"],
    ["bachelor-lang-german", "minor-60", "German 60", "SA23_BA_de_v01"],
  ] as const;
  for (const [id, variant, programme, version] of cases) {
    const assignment = { programme, version, paths: ["Published path"] };
    expect(sourceAssignmentMatches(plan(id, variant), [assignment])).toEqual([
      assignment,
    ]);
  }
});

it("extracts the published curriculum stage without inferring it from elapsed study time", () => {
  expect(
    sourceStage({
      programme: "Computer Science 120",
      version: "2022_1/V_01",
      paths: ["BSc in Computer science, Major, 2nd-3rd year > electives"],
    }),
  ).toBe("2nd-3rd year");
  expect(
    sourceStage({
      programme: "Psychology 180",
      version: "SA19_BA_fr_de_bil_v02",
      paths: ["Mémoire de bachelor"],
    }),
  ).toBeNull();
});

it("uses an optional stage preference for ordering without deciding eligibility", () => {
  const first = {
    programme: "Computer Science 120",
    version: "2022_1/V_01",
    paths: ["BSc in Computer science, Major, 1st year"],
  };
  const later = {
    programme: "Computer Science 120",
    version: "2022_1/V_01",
    paths: ["BSc in Computer science, Major, 2nd-3rd year"],
  };
  expect(stagePriority([first], "1")).toBeGreaterThan(
    stagePriority([later], "1"),
  );
  expect(stagePriority([later], "3")).toBeGreaterThan(
    stagePriority([first], "3"),
  );
});

it("includes cross-faculty Business Informatics but rejects unsupported versions and other subjects", () => {
  const business = {
    programme: "Ba - Business Informatics - 180 ECTS",
    version: "2020-SA_V03",
    paths: ["2nd year 60 ECTS > Software Engineering"],
  };
  const planValue = plan("bachelor-digitinf-businessinformatics", "major-180");
  expect(sourceAssignmentMatches(planValue, [business])).toEqual([business]);
  expect(
    sourceAssignmentMatches(planValue, [{ ...business, version: "older" }]),
  ).toEqual([]);
  expect(
    sourceAssignmentMatches(planValue, [
      { ...business, programme: "Computer Science 120" },
    ]),
  ).toEqual([]);
  planValue.degreeSelection!.components[0].recipeVersion =
    "previous-pinned-edition";
  expect(sourceAssignmentMatches(planValue, [business])).toEqual([business]);
  expect(
    sourceAssignmentMatches(plan("bachelor-sci-chemistry", "major-150"), [
      { ...business, programme: "Biochemistry 120" },
    ]),
  ).toEqual([]);
});
