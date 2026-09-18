import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import App from "../App";
import { PlanStore } from "../planner/storage";
import { createPlan } from "../planner/domain";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  sessionStorage.clear();
  localStorage.setItem("unifr.language", "en");
});
afterEach(() => vi.unstubAllGlobals());

it("offers optional accounts without replacing local plans; hides recovery after acknowledgement", async () => {
  const local = createPlan({
    id: "local",
    scenarioId: "s",
    name: "My guest plan",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  await new PlanStore(indexedDB).save(local);
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      requests.push(request.url);
      const path = new URL(request.url).pathname;
      const body = path.endsWith("/register")
        ? {
            username: "alice",
            recoveryCode: "one-time-recovery-code-keep-this-safe",
          }
        : path.endsWith("/import")
          ? {
              plans: [
                {
                  id: "cloud",
                  revision: 1,
                  snapshot: { ...local, id: "cloud" },
                  conflictOf: null,
                },
              ],
            }
          : { plans: [] };
      return new Response(JSON.stringify(body), {
        status: path.endsWith("/session") ? 401 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <App />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Optional account" });
  await user.click(screen.getByRole("button", { name: "Create account" }));
  await user.type(screen.getByLabelText("Username"), "alice");
  await user.type(screen.getByLabelText("Password"), "long unique passphrase");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    await screen.findByText("one-time-recovery-code-keep-this-safe"),
  ).toBeVisible();
  await waitFor(() =>
    expect(requests.some((p) => p.endsWith("/plans/import"))).toBe(true),
  );
  expect((await new PlanStore(indexedDB).load()).plans).toEqual([local]);
  await user.click(
    screen.getByRole("button", { name: "I saved my recovery code" }),
  );
  expect(
    screen.queryByText("one-time-recovery-code-keep-this-safe"),
  ).not.toBeInTheDocument();
  expect(JSON.stringify(sessionStorage)).not.toContain("one-time-recovery");
});

it.each([
  ["de", "Optionales Konto", "Benutzername"],
  ["fr", "Compte facultatif", "Nom d’utilisateur"],
  ["en", "Optional account", "Username"],
])("labels account controls in %s", async (language, heading, username) => {
  localStorage.setItem("unifr.language", language);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 401 })),
  );
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
  expect(screen.getByLabelText(username)).toBeVisible();
});
