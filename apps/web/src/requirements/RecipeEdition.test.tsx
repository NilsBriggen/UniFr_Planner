import { render, screen } from "@testing-library/react";
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
