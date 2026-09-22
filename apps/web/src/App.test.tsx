import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

function mount(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("application shell", () => {
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
