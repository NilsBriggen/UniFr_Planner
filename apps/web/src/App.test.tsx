import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createPlan } from "./planner/domain";
import { PlanStore } from "./planner/storage";

function mount(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("application shell", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-CH"]);
  });
  afterEach(() => vi.restoreAllMocks());
  it.each([
    [["fr-CH", "de-CH"], "fr", "Vos études. Votre parcours."],
    [["it-CH", "en-GB"], "en", "Your studies. Your plan."],
    [["it-CH"], "de", "Dein Studium. Dein Plan."],
  ])(
    "uses a supported browser language on first visit: %s",
    (browser, language, title) => {
      vi.spyOn(navigator, "languages", "get").mockReturnValue(browser);
      mount();
      expect(
        screen.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      expect(document.documentElement.lang).toBe(language);
    },
  );
  it("keeps an explicitly saved German preference on a French browser", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-CH"]);
    localStorage.setItem("unifr.language", "de");
    mount();
    expect(document.documentElement.lang).toBe("de");
  });
  it("has three task destinations and settings in the header", () => {
    localStorage.setItem("unifr.language", "en");
    mount();
    const nav = within(
      screen.getByRole("navigation", { name: "Main navigation" }),
    );
    expect(nav.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Timetable",
      "Courses",
      "My studies",
    ]);
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("link", { name: "Settings" }),
    );
  });
  it("offers guest planning and the unchanged bilingual logo", () => {
    mount();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Dein Studium. Dein Plan.",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "Universität Freiburg / Université de Fribourg",
      }),
    ).toHaveAttribute("src", "/unifr-logo.png");
    expect(screen.getByText("Pläne auf diesem Gerät")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Planung starten" }),
    ).toHaveAttribute("href", "/setup");
  });

  it("switches and persists French and English, including document language", async () => {
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Français" }));
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Vos études. Votre parcours.",
      }),
    ).toBeVisible();
    expect(document.documentElement.lang).toBe("fr");
    expect(localStorage.getItem("unifr.language")).toBe("fr");
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your studies. Your plan.",
      }),
    ).toBeVisible();
    expect(document.documentElement.lang).toBe("en");
  });

  it("restores a saved language", async () => {
    localStorage.setItem("unifr.language", "en");
    mount("/catalogue");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Course catalogue",
      }),
    ).toBeVisible();
  });

  it.each([
    ["/setup", "Studium einrichten"],
    ["/plan", "Studienplan"],
    ["/semester/HS-2026", "Semesterübersicht"],
    ["/catalogue", "Kurskatalog"],
    ["/requirements", "Studienanforderungen"],
    ["/settings", "Optionales Konto"],
    ["/admin", "Administration"],
    ["/missing", "Seite nicht gefunden"],
  ])("renders a directly opened route %s", async (path, title) => {
    mount(path);
    expect(
      await screen.findByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    expect(document.title).toBe(`${title} · UniFr Planner`);
  });

  it("changes between semester agenda and day view", async () => {
    mount("/semester/HS-2026");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tag" }));
    expect(screen.getByRole("button", { name: "Tag" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByText("Keine Veranstaltungen für diesen Tag."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Agenda" }));
    expect(
      screen.getByText("Noch keine Veranstaltungen in diesem Semester."),
    ).toBeVisible();
  });
});

describe("header New plan link", () => {
  beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
  afterEach(() => vi.unstubAllGlobals());
  const seed = () =>
    new PlanStore(indexedDB).save(
      createPlan({
        id: "saved",
        scenarioId: "s",
        name: "Saved degree",
        programme: "CS",
        startTerm: "AS-2026",
        semesterCount: 6,
        targetEcts: 180,
      }),
      null,
    );
  // /plan has a second <header> for its workspace heading.
  const header = () => within(document.querySelector<HTMLElement>(".header")!);

  it("is absent until a plan exists", async () => {
    localStorage.setItem("unifr.language", "en");
    mount("/plan");
    await screen.findByText(/^Your plans stay in this browser/);
    expect(
      header().queryByRole("link", { name: "New plan" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["en", "New plan", "Current plan"],
    ["de", "Neuer Plan", "Aktueller Plan"],
    ["fr", "Nouveau plan", "Plan actuel"],
  ])(
    "opens setup next to the plan switcher in %s",
    async (language, name, planLabel) => {
      localStorage.setItem("unifr.language", language);
      await seed();
      mount("/catalogue");
      await waitFor(() =>
        expect(header().getByLabelText(planLabel)).toBeEnabled(),
      );
      expect(header().getByRole("link", { name })).toHaveAttribute(
        "href",
        "/setup",
      );
    },
  );

  it("is not repeated on the setup page itself", async () => {
    localStorage.setItem("unifr.language", "en");
    await seed();
    mount("/setup");
    await waitFor(() =>
      expect(header().getByLabelText("Current plan")).toBeEnabled(),
    );
    expect(
      header().queryByRole("link", { name: "New plan" }),
    ).not.toBeInTheDocument();
  });
});
