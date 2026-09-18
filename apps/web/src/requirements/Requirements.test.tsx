import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import App from "../App";
import { PlanStore } from "../planner/storage";
import { createPlan } from "../planner/domain";
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
  await new PlanStore(indexedDB).save(plan);
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
    await new PlanStore(indexedDB).save(plan);
    render(
      <MemoryRouter initialEntries={["/requirements"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: heading });
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
