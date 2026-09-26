import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { createPlan } from "../planner/domain";
import { DegreeSelectionForm } from "./RecipeChooser";
import type { ResolvedDegree } from "../../../../packages/domain/src/recipes";
import { recipeRegistry } from "../../../../packages/domain/src/registry";

function oldPlan() {
  const plan = createPlan({
    id: "old",
    scenarioId: "s",
    name: "Existing degree",
    programme: "CS + Mathematics",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  plan.degreeSelection = {
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
        programmeId: "bachelor-sci-mathematics",
        variantId: "minor-60",
        startSemester: "SS-2027",
        recipeVersion: "2026-27.1",
      },
    ],
  };
  return plan;
}
it("edits a retained curriculum without migrating it or replacing an independent minor start", async () => {
  const onCommit = vi.fn<(degree: ResolvedDegree) => Promise<boolean>>(
    async () => true,
  );
  render(
    <MemoryRouter>
      <DegreeSelectionForm plan={oldPlan()} language="en" onCommit={onCommit} />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Major · Starting semester · Season",
    }),
    "SS",
  );
  await user.click(screen.getByRole("button", { name: "Preview degree" }));
  await user.click(
    screen.getByRole("button", { name: "Save degree selection" }),
  );
  expect(onCommit).toHaveBeenCalledOnce();
  const components = onCommit.mock.calls[0][0].selection.components;
  expect(components.map((c) => c.recipeVersion)).toEqual([
    "2026-27.1",
    "2026-27.1",
  ]);
  expect(components.find((c) => c.slotId === "minor")?.startSemester).toBe(
    "SS-2027",
  );
});
it("requires an explicit preview and save to upgrade every component together", async () => {
  const onCommit = vi.fn<(degree: ResolvedDegree) => Promise<boolean>>(
    async () => true,
  );
  render(
    <MemoryRouter>
      <DegreeSelectionForm plan={oldPlan()} language="en" onCommit={onCommit} />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Review with current curriculum" }),
  );
  expect(onCommit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Preview degree" }));
  await user.click(
    screen.getByRole("button", { name: "Save degree selection" }),
  );
  expect(
    onCommit.mock.calls[0][0].selection.components.every(
      (c) => c.recipeVersion === recipeRegistry.edition,
    ),
  ).toBe(true);
});
it("keeps the saved programme selected and previewable while a search excludes it", async () => {
  render(
    <MemoryRouter>
      <DegreeSelectionForm
        plan={oldPlan()}
        language="en"
        onCommit={async () => true}
      />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("searchbox", { name: "Search main programme" }),
    "law",
  );
  const main = screen.getByRole("combobox", { name: "Main programme" });
  expect(main).toHaveValue("bachelor-digitinf-informatics");
  expect(
    within(main).getByRole("option", { name: "Computer Science" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Search all faculties" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Preview degree" }));
  expect(
    screen.getByRole("button", { name: "Save degree selection" }),
  ).toBeEnabled();
  await user.click(
    screen.getByRole("button", { name: "Search all faculties" }),
  );
  expect(screen.getByRole("combobox", { name: "Faculty" })).toHaveValue("");
  expect(main).toHaveValue("bachelor-digitinf-informatics");
  expect(screen.getByLabelText("Minor · 60 ECTS")).toHaveValue(
    "bachelor-sci-mathematics/minor-60",
  );
});
it("choosing the saved programme again from the search keeps its components", async () => {
  render(
    <MemoryRouter>
      <DegreeSelectionForm
        plan={oldPlan()}
        language="en"
        onCommit={async () => true}
      />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("searchbox", { name: "Search main programme" }),
    "computer{Enter}",
  );
  await user.click(
    screen.getByRole("button", {
      name: "Computer Science · Science and Medicine",
      pressed: true,
    }),
  );
  expect(screen.getByLabelText("Degree structure")).toHaveValue("ba-120-60");
  expect(screen.getByLabelText("Minor · 60 ECTS")).toHaveValue(
    "bachelor-sci-mathematics/minor-60",
  );
});
it("keeps the search usable but choices locked while busy", async () => {
  render(
    <MemoryRouter>
      <DegreeSelectionForm
        plan={oldPlan()}
        language="en"
        busy
        onCommit={async () => true}
      />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  const search = screen.getByRole("searchbox", {
    name: "Search main programme",
  });
  expect(search).toBeEnabled();
  expect(
    screen.getByRole("combobox", { name: "Main programme" }),
  ).toBeDisabled();
  await user.type(search, "math");
  const pick = screen.getByRole("button", {
    name: "Mathematics · Science and Medicine",
  });
  // The quick pick is a choice too, so it shows it is locked instead of ignoring clicks.
  expect(pick).toBeDisabled();
  await user.click(pick);
  expect(screen.getByRole("combobox", { name: "Main programme" })).toHaveValue(
    "bachelor-digitinf-informatics",
  );
});
