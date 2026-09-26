import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { IDBFactory } from "fake-indexeddb";
import App from "../App";
import { DegreeSelectionForm } from "../requirements/RecipeChooser";
import { createPlan } from "./domain";
import { PlanStore } from "./storage";
import { recipeRegistry } from "../../../../packages/domain/src/registry";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function setup() {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  render(
    <MemoryRouter initialEntries={["/setup"]}>
      <App />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Main programme")).toBeEnabled(),
  );
}

it("moves from studies to review without a separate preview action", async () => {
  await setup();
  expect(screen.getByLabelText("Search main programme")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Search main programme"), {
    target: { value: "Law" },
  });
  fireEvent.change(screen.getByLabelText("Main programme"), {
    target: { value: "bachelor-ius-law" },
  });

  expect(screen.queryByLabelText("Variant / track")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Degree structure"), {
    target: { value: "ba-180" },
  });
  expect(
    screen.queryByRole("button", { name: "Preview degree" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review and start" }));

  expect(await screen.findByText("2. Review and start")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Law", level: 3 })).toBeVisible();
  expect(screen.getByLabelText("Planning semester · Season")).toBeVisible();
  expect(screen.getByLabelText("Planning semester · Year")).toBeVisible();
  expect(screen.getByRole("button", { name: "Start planning" })).toBeVisible();
});

it("keeps the structured study draft when switching to the manual fallback and back", async () => {
  await setup();
  fireEvent.change(screen.getByLabelText("Main programme"), {
    target: { value: "bachelor-digitinf-informatics" },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: "My programme or combination is missing",
    }),
  );
  fireEvent.change(screen.getByLabelText("Programme"), {
    target: { value: "External programme" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Choose a listed degree" }),
  );
  expect(screen.getByLabelText("Main programme")).toHaveValue(
    "bachelor-digitinf-informatics",
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "My programme or combination is missing",
    }),
  );
  expect(screen.getByLabelText("Programme")).toHaveValue("External programme");
});

it("retains a configured 2024 start when switching to manual setup", async () => {
  await setup();
  fireEvent.change(screen.getByLabelText("Major · Starting semester · Year"), {
    target: { value: "2024" },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: "My programme or combination is missing",
    }),
  );
  expect(screen.getByLabelText("Study start · Year")).toHaveValue(2024);
  fireEvent.click(
    screen.getByRole("button", { name: "Choose a listed degree" }),
  );
  expect(screen.getByLabelText("Major · Starting semester · Year")).toHaveValue(
    2024,
  );
});

it("lets a new student plan a later term without opening completed-course history", async () => {
  await setup();
  fireEvent.click(
    screen.getByRole("button", {
      name: "My programme or combination is missing",
    }),
  );
  fireEvent.change(screen.getByLabelText("Study start · Season"), {
    target: { value: "AS" },
  });
  fireEvent.change(screen.getByLabelText("Study start · Year"), {
    target: { value: "2026" },
  });
  fireEvent.change(screen.getByLabelText("Planning semester · Season"), {
    target: { value: "SS" },
  });
  fireEvent.change(screen.getByLabelText("Planning semester · Year"), {
    target: { value: "2027" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start planning" }));
  expect(
    await screen.findByRole("heading", { name: "Course catalogue" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: /Completed courses/i }),
  ).not.toBeInTheDocument();
});

it("keeps setup usable while invalid values are being typed", async () => {
  await setup();
  fireEvent.click(
    screen.getByRole("button", {
      name: "My programme or combination is missing",
    }),
  );
  for (const label of ["Plan name", "Programme"]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: " " } });
    expect(screen.getByLabelText(label)).toHaveValue(" ");
  }
  for (const year of ["9999", "2099", "2088", "0000", ""]) {
    fireEvent.change(screen.getByLabelText("Study start · Year"), {
      target: { value: year },
    });
    expect(
      screen.getByRole("button", { name: "Start planning" }),
    ).toBeVisible();
  }
  fireEvent.change(screen.getByLabelText("Degree target (ECTS)"), {
    target: { value: "0" },
  });
  expect(
    screen.getByRole("button", { name: "Choose a listed degree" }),
  ).toBeEnabled();
});

it("keeps an unavailable curriculum pinned until an explicit migration review", async () => {
  const plan = createPlan({
    id: "old",
    scenarioId: "main",
    name: "Old degree",
    programme: "Law",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  plan.degreeSelection = {
    structureId: "ba-180",
    components: [
      {
        slotId: "major",
        programmeId: "bachelor-ius-law",
        variantId: "major-180",
        startSemester: "AS-2026",
        recipeVersion: "previous-edition",
      },
    ],
  };
  const onCommit = vi.fn().mockResolvedValue(true);
  render(<DegreeSelectionForm plan={plan} language="en" onCommit={onCommit} />);
  expect(screen.getByRole("button", { name: "Preview degree" })).toBeDisabled();
  expect(onCommit).not.toHaveBeenCalled();
  expect(plan.degreeSelection.components[0].recipeVersion).toBe(
    "previous-edition",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Review with current curriculum" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview degree" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Save degree selection" }),
  );
  await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
  expect(onCommit.mock.calls[0][0].selection.components[0].recipeVersion).toBe(
    recipeRegistry.edition,
  );
  expect(plan.degreeSelection.components[0].recipeVersion).toBe(
    "previous-edition",
  );
});

it.each([
  ["bachelor", "bachelor-ius-law", "major-180", "ba-180", 180],
  ["master", "master-sci-biochemistry", "major-120", "ma-120", 120],
])(
  "creates a %s degree after a failed save without losing the configuration",
  async (level, programme, variant, structure, ects) => {
    await setup();
    fireEvent.change(screen.getByLabelText("Degree"), {
      target: { value: level },
    });
    fireEvent.change(screen.getByLabelText("Main programme"), {
      target: { value: programme },
    });
    const variantField = screen.queryByLabelText("Variant / track");
    if (variantField)
      fireEvent.change(variantField, { target: { value: variant } });
    const structureField = screen.queryByLabelText("Degree structure");
    if (structureField)
      fireEvent.change(structureField, { target: { value: structure } });
    fireEvent.click(screen.getByRole("button", { name: "Review and start" }));
    fireEvent.change(screen.getByLabelText("Plan name"), {
      target: { value: "My configured studies" },
    });
    const save = vi
      .spyOn(PlanStore.prototype, "save")
      .mockRejectedValueOnce(new Error("Disk full"));
    fireEvent.click(screen.getByRole("button", { name: "Start planning" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Start planning" }),
      ).toBeEnabled(),
    );
    expect((await new PlanStore(indexedDB).load()).plans).toHaveLength(0);
    expect(screen.getByLabelText("Plan name")).toHaveValue(
      "My configured studies",
    );
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Start planning" }));
    await waitFor(async () =>
      expect((await new PlanStore(indexedDB).load()).plans).toHaveLength(1),
    );
    const plan = (await new PlanStore(indexedDB).load()).plans[0];
    expect(plan.targetEcts).toBe(ects);
    expect(plan.degreeSelection?.structureId).toBe(structure);
    expect(plan.degreeSelection?.components[0]).toMatchObject({
      programmeId: programme,
      variantId: variant,
      recipeVersion: recipeRegistry.edition,
    });
  },
);

it("preserves an edited plan name and part-time horizon through Back and Review and persistence", async () => {
  await setup();
  fireEvent.change(screen.getByLabelText("Main programme"), {
    target: { value: "bachelor-ius-law" },
  });
  fireEvent.change(screen.getByLabelText("Degree structure"), {
    target: { value: "ba-180" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review and start" }));
  fireEvent.change(screen.getByLabelText("Plan name"), {
    target: { value: "My part-time law" },
  });
  fireEvent.change(screen.getByLabelText("Number of semesters"), {
    target: { value: "12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "Review and start" }));
  expect(screen.getByLabelText("Plan name")).toHaveValue("My part-time law");
  expect(screen.getByLabelText("Number of semesters")).toHaveValue(12);
  fireEvent.click(screen.getByRole("button", { name: "Start planning" }));
  await waitFor(async () =>
    expect((await new PlanStore(indexedDB).load()).plans).toHaveLength(1),
  );
  const saved = (await new PlanStore(indexedDB).load()).plans[0];
  expect(saved.name).toBe("My part-time law");
  expect(saved.semesters).toHaveLength(12);
});

it("shows programme search results as a live count and quick picks", async () => {
  await setup();
  const search = screen.getByLabelText("Search main programme");
  const status = document.getElementById(
    search.getAttribute("aria-describedby")!,
  )!;
  // The live region exists before typing, so its first update is announced.
  expect(status).toHaveAttribute("role", "status");
  expect(status).toBeEmptyDOMElement();
  fireEvent.change(search, { target: { value: "Law" } });
  expect(status).toHaveTextContent("2 programmes");
  const picks = within(
    screen.getByRole("list", { name: "Matching programmes" }),
  ).getAllByRole("button");
  expect(picks.map((pick) => pick.textContent)).toEqual([
    "Law · Law",
    "Part-time Law studies · Law",
  ]);
  expect(screen.getAllByLabelText("Main programme")).toHaveLength(1);
  expect(screen.getByLabelText("Main programme")).toHaveValue("");
  fireEvent.click(picks[1]);
  expect(screen.getByLabelText("Main programme")).toHaveValue(
    "bachelor-ius-lawparttime",
  );
  expect(picks[1]).toHaveAttribute("aria-pressed", "true");
  expect(picks[0]).toHaveAttribute("aria-pressed", "false");
});

it("never chooses a programme while typing and picks a single match on Enter", async () => {
  await setup();
  const user = userEvent.setup();
  const search = screen.getByLabelText("Search main programme");
  await user.type(search, "math");
  expect(search).toHaveAccessibleDescription("1 programme");
  expect(screen.getByLabelText("Main programme")).toHaveValue("");
  await user.keyboard("{Enter}");
  expect(screen.getByLabelText("Main programme")).toHaveValue(
    "bachelor-sci-mathematics",
  );
  expect(screen.getByLabelText("Degree structure")).toBeVisible();
  expect(screen.getByText("1. Studies")).toBeVisible();
});

it("reports a search without matches and keeps only the placeholder", async () => {
  await setup();
  fireEvent.change(screen.getByLabelText("Search main programme"), {
    target: { value: "zzzz" },
  });
  expect(
    screen.getByText(
      "No programme matches this search. Try another name, degree or faculty.",
    ),
  ).toHaveAttribute("role", "status");
  expect(
    within(screen.getByLabelText("Main programme")).getAllByRole("option"),
  ).toHaveLength(1);
  expect(
    screen.queryByRole("list", { name: "Matching programmes" }),
  ).not.toBeInTheDocument();
});

it("searches all faculties from a faculty without matches", async () => {
  await setup();
  fireEvent.change(screen.getByLabelText("Faculty"), {
    target: { value: "law" },
  });
  const search = screen.getByLabelText("Search main programme");
  fireEvent.change(search, { target: { value: "math" } });
  expect(search).toHaveAccessibleDescription(
    "No programme matches this search. Try another name, degree or faculty.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Search all faculties" }));
  expect(screen.getByLabelText("Faculty")).toHaveValue("");
  expect(
    screen.getByRole("button", { name: "Mathematics · Science and Medicine" }),
  ).toBeVisible();
  expect(search).toHaveFocus();
  expect(screen.getByLabelText("Main programme")).toHaveValue("");
  expect(
    screen.queryByRole("button", { name: "Search all faculties" }),
  ).not.toBeInTheDocument();
});

it("keeps Enter in the search on the studies step", async () => {
  await setup();
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText("Main programme"), {
    target: { value: "bachelor-pedpsy-psychology" },
  });
  // A complete selection makes Enter a form submission unless the search handles it.
  expect(
    screen.getByRole("button", { name: "Review and start" }),
  ).toBeEnabled();
  const search = screen.getByLabelText("Search main programme");
  await user.type(search, "zzzz{Enter}");
  expect(screen.queryByText("2. Review and start")).not.toBeInTheDocument();
  expect(screen.getByText("1. Studies")).toBeVisible();
  expect(search).toHaveFocus();
  expect(screen.getByLabelText("Main programme")).toHaveValue(
    "bachelor-pedpsy-psychology",
  );
  await user.clear(search);
  await user.type(search, "psy{Enter}");
  expect(screen.queryByText("2. Review and start")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Psychology · Humanities" }),
  ).toHaveFocus();
});

it("finds German programme names and keeps the chosen one", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "de");
  render(
    <MemoryRouter initialEntries={["/setup"]}>
      <App />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Hauptprogramm")).toBeEnabled(),
  );
  const user = userEvent.setup();
  const search = screen.getByLabelText("Hauptprogramm suchen");
  const main = screen.getByLabelText("Hauptprogramm");
  // "Inf" alone matches only Wirtschaftsinformatik; nothing may be chosen on the way.
  await user.type(search, "Informatik");
  expect(search).toHaveAccessibleDescription("2 Studienprogramme");
  expect(main).toHaveValue("");
  const picks = within(
    screen.getByRole("list", { name: "Passende Studienprogramme" }),
  ).getAllByRole("button");
  expect(picks.map((pick) => pick.textContent)).toEqual([
    "Informatik · Mathematisch-Naturwissenschaftliche und Medizinische Fakultät",
    "Wirtschaftsinformatik · Wirtschafts- und Sozialwissenschaften",
  ]);
  await user.click(picks[0]);
  expect(main).toHaveValue("bachelor-digitinf-informatics");
  expect(
    within(main).getByRole("option", { selected: true }),
  ).toHaveTextContent("Informatik");
  await user.clear(search);
  await user.type(search, "Computer{Enter}");
  expect(search).toHaveAccessibleDescription("1 Studienprogramm");
  expect(main).toHaveValue("bachelor-digitinf-informatics");
  expect(
    screen.getByRole("button", {
      name: "Informatik · Mathematisch-Naturwissenschaftliche und Medizinische Fakultät",
    }),
  ).toHaveAttribute("aria-pressed", "true");
});
