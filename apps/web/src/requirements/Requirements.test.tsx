import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import App from "../App";
import { PlanStore } from "../planner/storage";
import { createPlan } from "../planner/domain";
import { recipeMessages } from "./recipeMessages";
import { bindProgramme } from "./adapter";

it("can clear stale checklist-only evidence and restore evaluation", async () => {
  localStorage.setItem("unifr.language", "en");
  const plan = bindProgramme(
    createPlan({
      id: "stale",
      scenarioId: "s",
      name: "Checklist recovery",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    { code: "CS-120", version: "2026.1", cohort: 2026 },
  );
  plan.scenarios[0].requirementEvidence = {
    overrides: [],
    completedChecklist: ["removed-duty"],
  };
  await new PlanStore(indexedDB).save(plan, null);
  render(
    <MemoryRouter initialEntries={["/requirements"]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("alert");
  await userEvent.click(
    screen.getByRole("button", { name: "Clear requirement evidence" }),
  );
  await screen.findByRole("list", { name: "Study requirements" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    (await new PlanStore(indexedDB).load()).plans[0].scenarios[0]
      .requirementEvidence,
  ).toEqual({ overrides: [], completedChecklist: [] });
});

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());
for (const [
  language,
  heading,
  bind,
  course,
  requirement,
  reason,
  save,
  override,
  sources,
] of [
  [
    "en",
    "Study requirements",
    "Add programme",
    "Course",
    "Requirement",
    "Reason / approval reference",
    "Save personal override",
    "Personal override",
    "Sources",
  ],
  [
    "de",
    "Studienanforderungen",
    "Studienprogramm hinzufügen",
    "Kurs",
    "Anforderung",
    "Begründung / Anerkennungsnachweis",
    "Persönliche Ausnahme speichern",
    "Persönliche Ausnahme",
    "Quellen",
  ],
  [
    "fr",
    "Exigences du cursus",
    "Ajouter un programme",
    "Cours",
    "Exigence",
    "Motif / référence de reconnaissance",
    "Enregistrer la dérogation personnelle",
    "Dérogation personnelle",
    "Sources",
  ],
])
  it(`renders persistent programme allocation, overrides and citations in ${language}`, async () => {
    localStorage.setItem("unifr.language", language);
    const plan = createPlan({
      id: "p",
      scenarioId: "s",
      name: "Degree",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    });
    plan.scenarios[0].courses.push({
      id: "transfer",
      code: "TRANSFER",
      titles: { en: "Transfer course" },
      ects: 6,
      status: "completed",
      semester: null,
      pinned: false,
      offering: null,
    });
    await new PlanStore(indexedDB).save(plan, null);
    render(
      <MemoryRouter initialEntries={["/requirements"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: heading });
    await userEvent.click(
      await screen.findByText(
        recipeMessages[language as keyof typeof recipeMessages].legacy,
      ),
    );
    await userEvent.click(await screen.findByRole("button", { name: bind }));
    await screen.findByRole("list", { name: heading });
    const ruleDisclosure = screen
      .getByText(
        language === "en"
          ? "Introduction to programming"
          : language === "de"
            ? "Programmierung"
            : "Introduction à la programmation",
        { selector: "strong", exact: true },
      )
      .closest("details");
    expect(ruleDisclosure).not.toHaveAttribute("open");
    await userEvent.selectOptions(
      screen.getByLabelText(course, { exact: true }),
      "transfer",
    );
    await userEvent.selectOptions(
      screen.getByLabelText(requirement, { exact: true }),
      "CS-120@2026.1/SIN.01023",
    );
    await userEvent.type(
      screen.getByLabelText(reason, { exact: true }),
      "Advisor reference 12",
    );
    await userEvent.click(screen.getByRole("button", { name: save }));
    expect(
      await screen.findByText("Advisor reference 12", { exact: true }),
    ).toBeVisible();
    expect(
      screen.getByText("Advisor reference 12").closest("li"),
    ).toHaveTextContent(/Transfer course · TRANSFER →/);
    expect(
      screen.getAllByText(override, { exact: true }).length,
    ).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByText(sources, { exact: true })[0]);
    expect(
      within(screen.getByRole("list", { name: heading }))
        .getAllByRole("link")
        .some((a) => a.getAttribute("href")?.includes("Plan_BSc_IN_fr.pdf")),
    ).toBe(true);
    const saved = await new PlanStore(indexedDB).load();
    expect(
      saved.plans[0].scenarios[0].requirementEvidence?.overrides[0].reason,
    ).toBe("Advisor reference 12");
  });

it("offers seven faculty groups, major-only recipes, and saves a preview with independent minor semester", async () => {
  localStorage.setItem("unifr.language", "en");
  await new PlanStore(indexedDB).save(
    createPlan({
      id: "recipe",
      scenarioId: "s",
      name: "Recipe degree",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    null,
  );
  render(
    <MemoryRouter initialEntries={["/requirements"]}>
      <App />
    </MemoryRouter>,
  );
  const faculty = await screen.findByRole("combobox", { name: "Faculty" });
  expect(within(faculty).getAllByRole("option")).toHaveLength(8);
  await userEvent.selectOptions(faculty, "science-medicine");
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Main programme" }),
    "bachelor-digitinf-informatics",
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Variant / track" }),
    "major-120",
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Degree structure" }),
    "ba-120-60",
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Minor · 60 ECTS" }),
    "bachelor-digitinf-businessinformatics/minor-60",
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", {
      name: "Minor · 60 ECTS · Starting semester · Season",
    }),
    "SS",
  );
  await userEvent.clear(
    screen.getByRole("spinbutton", {
      name: "Minor · 60 ECTS · Starting semester · Year",
    }),
  );
  await userEvent.type(
    screen.getByRole("spinbutton", {
      name: "Minor · 60 ECTS · Starting semester · Year",
    }),
    "2027",
  );
  await userEvent.click(screen.getByRole("button", { name: "Preview degree" }));
  expect(await screen.findByText("Applied exceptions")).toBeVisible();
  expect(screen.getByText("Review gaps")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Save degree selection" }),
  );
  await screen.findByRole("list", { name: "Study requirements" });
  const saved = (await new PlanStore(indexedDB).load()).plans[0];
  expect(saved.degreeSelection?.components[1].startSemester).toBe("SS-2027");
  expect(saved.targetEcts).toBe(180);
});

it("shows saved studies as a summary until editing is requested", async () => {
  localStorage.setItem("unifr.language", "en");
  const { bindDegreeSelection } = await import("./adapter");
  const plan = bindDegreeSelection(
    createPlan({
      id: "summary",
      scenarioId: "s",
      name: "Law",
      programme: "Law",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    {
      structureId: "ba-180",
      components: [
        {
          slotId: "major",
          programmeId: "bachelor-ius-law",
          variantId: "major-180",
          startSemester: "AS-2026",
          recipeVersion: "2026-27.1",
        },
      ],
    },
  );
  await new PlanStore(indexedDB).save(plan, null);
  render(
    <MemoryRouter initialEntries={["/requirements"]}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("heading", { name: "Law" })).toBeVisible();
  expect(screen.queryByLabelText("Main programme")).not.toBeInTheDocument();
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit studies" }),
  );
  expect(await screen.findByLabelText("Main programme")).toBeVisible();
});

it("preserves an independently saved minor start when editing the major start", async () => {
  localStorage.setItem("unifr.language", "en");
  const { bindDegreeSelection } = await import("./adapter");
  const plan = bindDegreeSelection(
    createPlan({
      id: "cohorts",
      scenarioId: "s",
      name: "CS",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    {
      structureId: "ba-120-60",
      components: [
        {
          slotId: "major",
          programmeId: "bachelor-digitinf-informatics",
          variantId: "major-120",
          startSemester: "AS-2026",
          recipeVersion: "2026-27.1",
        },
        {
          slotId: "minor",
          programmeId: "bachelor-digitinf-businessinformatics",
          variantId: "minor-60",
          startSemester: "SS-2027",
          recipeVersion: "2026-27.1",
        },
      ],
    },
  );
  await new PlanStore(indexedDB).save(plan, null);
  render(
    <MemoryRouter initialEntries={["/requirements"]}>
      <App />
    </MemoryRouter>,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit studies" }),
  );
  await userEvent.clear(
    screen.getByRole("spinbutton", {
      name: "Major · Starting semester · Year",
    }),
  );
  await userEvent.type(
    screen.getByRole("spinbutton", {
      name: "Major · Starting semester · Year",
    }),
    "2025",
  );
  await userEvent.click(screen.getByRole("button", { name: "Preview degree" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Save degree selection" }),
  );
  const saved = (await new PlanStore(indexedDB).load()).plans[0];
  expect(
    saved.degreeSelection?.components.find(
      (component) => component.slotId === "minor",
    )?.startSemester,
  ).toBe("SS-2027");
});
it("shows pinned recipe gaps after reopening and keeps additions outside degree progress", async () => {
  localStorage.setItem("unifr.language", "en");
  const { bindDegreeSelection } = await import("./adapter");
  const plan = bindDegreeSelection(
    createPlan({
      id: "extra",
      scenarioId: "s",
      name: "Law with addition",
      programme: "Law",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    {
      structureId: "ba-180-extra-30",
      components: [
        {
          slotId: "major",
          programmeId: "bachelor-ius-law",
          variantId: "major-180",
          startSemester: "AS-2026",
          recipeVersion: "2026-27.1",
        },
        {
          slotId: "extra",
          programmeId: "bachelor-digitinf-businessinformatics",
          variantId: "minor-30",
          startSemester: "SS-2027",
          recipeVersion: "2026-27.1",
        },
      ],
    },
  );
  await new PlanStore(indexedDB).save(plan, null);
  render(
    <MemoryRouter initialEntries={["/requirements"]}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Review gaps")).toBeVisible();
  expect(
    screen.getByRole("region", {
      name: "Additional requirements outside the degree",
    }),
  ).toBeVisible();
  expect(screen.getByText("Credits toward the degree: 180 ECTS")).toBeVisible();
  expect(
    screen.getByText("Additional requirements outside the degree: 30 ECTS"),
  ).toBeVisible();
});

it("groups source gaps by programme and keeps technical diagnostics collapsed", async () => {
  localStorage.setItem("unifr.language", "en");
  const { bindDegreeSelection } = await import("./adapter");
  const plan = bindDegreeSelection(
    createPlan({
      id: "review-summary",
      scenarioId: "s",
      name: "Review summary",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    {
      structureId: "ba-120-60",
      components: [
        {
          slotId: "major",
          programmeId: "bachelor-digitinf-informatics",
          variantId: "major-120",
          startSemester: "AS-2026",
          recipeVersion: "2026-27.1",
        },
        {
          slotId: "minor",
          programmeId: "bachelor-digitinf-businessinformatics",
          variantId: "minor-60",
          startSemester: "AS-2026",
          recipeVersion: "2026-27.1",
        },
      ],
    },
  );
  await new PlanStore(indexedDB).save(plan, null);
  render(
    <MemoryRouter initialEntries={["/requirements"]}>
      <App />
    </MemoryRouter>,
  );
  const review = await screen.findByRole("region", { name: "Review gaps" });
  expect(
    within(review).getByRole("heading", { name: "Computer Science" }),
  ).toBeVisible();
  expect(
    within(review).getByRole("heading", { name: "Business Informatics" }),
  ).toBeVisible();
  const diagnostics = within(review)
    .getByText("Technical review details")
    .closest("details");
  expect(diagnostics).not.toHaveAttribute("open");
  const issues = within(review).getAllByText(
    /Unresolved requirement evidence:/,
  );
  expect(issues.length).toBeGreaterThan(0);
  for (const issue of issues) expect(diagnostics).toContainElement(issue);
});

it("shows selected courses separately from provisional requirement contribution and leaves the remainder unconfirmed", async () => {
  localStorage.setItem("unifr.language", "en");
  const plan = bindProgramme(
    createPlan({
      id: "reconcile",
      scenarioId: "s",
      name: "Credits",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    { code: "CS-120", version: "2026.1", cohort: 2026 },
  );
  plan.scenarios[0].courses.push(
    {
      id: "mapped",
      code: "SIN.01023",
      titles: { en: "Introduction to programming" },
      ects: 16,
      status: "planned",
      semester: "AS-2026",
      pinned: false,
      offering: null,
    },
    {
      id: "other",
      code: "MATH.404",
      titles: { en: "Linear Algebra II" },
      ects: 14,
      status: "planned",
      semester: "AS-2026",
      pinned: false,
      offering: null,
    },
  );
  await new PlanStore(indexedDB).save(plan, null);
  render(
    <MemoryRouter initialEntries={["/requirements"]}>
      <App />
    </MemoryRouter>,
  );
  const credits = (
    await screen.findByRole("heading", {
      name: "Credit reconciliation",
    })
  ).closest("section")!;
  expect(
    within(credits).getByText(/Selected course credits: 30 ECTS/),
  ).toBeVisible();
  expect(
    within(credits).getByText(/Contribution to modelled requirements: 16 ECTS/),
  ).toBeVisible();
  expect(
    within(credits).getByText(/Unallocated selected credits: 14 ECTS/),
  ).toBeVisible();
  expect(
    within(credits).getByText(
      /Remaining requirement total cannot yet be confirmed/,
    ),
  ).toBeVisible();
  expect(within(credits).getByText(/Linear Algebra II/)).toBeVisible();
  expect(screen.queryByText(/Still to earn/)).not.toBeInTheDocument();
});

it("explains source gaps in French while keeping original diagnostics collapsed", async () => {
  localStorage.setItem("unifr.language", "fr");
  const { bindDegreeSelection } = await import("./adapter");
  const plan = bindDegreeSelection(
    createPlan({
      id: "fr-gaps",
      scenarioId: "s",
      name: "Droit",
      programme: "Law",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    {
      structureId: "ba-120-60",
      components: [
        {
          slotId: "major",
          programmeId: "bachelor-digitinf-informatics",
          variantId: "major-120",
          startSemester: "AS-2026",
          recipeVersion: "2026-27.1",
        },
        {
          slotId: "minor",
          programmeId: "bachelor-digitinf-businessinformatics",
          variantId: "minor-60",
          startSemester: "AS-2026",
          recipeVersion: "2026-27.1",
        },
      ],
    },
  );
  await new PlanStore(indexedDB).save(plan, null);
  render(
    <MemoryRouter initialEntries={["/requirements"]}>
      <App />
    </MemoryRouter>,
  );
  const review = await screen.findByRole("region", {
    name: "Points à clarifier dans les sources",
  });
  expect(
    screen.queryByText(/ba-120-60/, { selector: "strong" }),
  ).not.toBeInTheDocument();
  expect(
    within(
      screen.getByRole("list", { name: "Exigences du cursus" }),
    ).queryByText(/bachelor: ba-120-60/),
  ).not.toBeInTheDocument();
  expect(
    within(review).getByText(/Vous pouvez planifier des cours/),
  ).toBeVisible();
  const diagnostics = within(review)
    .getByText("Détails techniques de la vérification")
    .closest("details");
  expect(diagnostics).not.toHaveAttribute("open");
  expect(
    within(review)
      .getAllByText(/Unresolved requirement evidence:/)
      .every((node) => diagnostics?.contains(node)),
  ).toBe(true);
  expect(
    within(review).queryByText(/Unresolved requirement evidence:/, {
      selector: "li:not(details li)",
    }),
  ).not.toBeInTheDocument();
});

it("links a known requirement code to course search without promising recognition", async () => {
  localStorage.setItem("unifr.language", "en");
  const plan = bindProgramme(
    createPlan({
      id: "find",
      scenarioId: "s",
      name: "Find",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    { code: "CS-120", version: "2026.1", cohort: 2026 },
  );
  await new PlanStore(indexedDB).save(plan, null);
  render(
    <MemoryRouter initialEntries={["/requirements"]}>
      <App />
    </MemoryRouter>,
  );
  const search = await screen.findByRole("link", {
    name: "Find matching courses · SIN.01023",
  });
  expect(search).toHaveAttribute("href", "/catalogue?q=SIN.01023&focus=all");
});

it("shows prior-study context without adding it to completed or mapped credits", async () => {
  localStorage.setItem("unifr.language", "en");
  const plan = bindProgramme(
    createPlan({
      id: "prior-context",
      scenarioId: "s",
      name: "Prior",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    { code: "CS-120", version: "2026.1", cohort: 2026 },
  );
  plan.scenarios[0].priorStudy = [
    {
      id: "prior",
      institution: "External University",
      period: "2020–2023",
      approximateEcts: 90,
      status: "recognition_pending",
      notes: "Transcript pending",
    },
  ];
  await new PlanStore(indexedDB).save(plan, null);
  render(
    <MemoryRouter initialEntries={["/requirements"]}>
      <App />
    </MemoryRouter>,
  );
  const credits = await screen.findByRole("region", {
    name: "Credit reconciliation",
  });
  expect(
    within(credits).getByText(/External University.*90 ECTS/),
  ).toBeVisible();
  expect(
    within(credits).getByText(/Recorded completed courses: 0 ECTS/),
  ).toBeVisible();
  expect(
    within(credits).getByText(/Contribution to modelled requirements: 0 ECTS/),
  ).toBeVisible();
});
