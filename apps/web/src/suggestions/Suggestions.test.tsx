import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { PlanStore } from "../planner/storage";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
});
afterEach(() => vi.unstubAllGlobals());
it("opens an explicit seeded example, compares without saving, applies and undoes after reload", async () => {
  const mount = () =>
    render(
      <MemoryRouter initialEntries={["/suggestions"]}>
        <App />
      </MemoryRouter>,
    );
  let view = mount();
  const example = await screen.findByRole("button", {
    name: "Open a separate example plan",
  });
  await waitFor(() => expect(example).toBeEnabled());
  await userEvent.click(example);
  await screen.findAllByRole("button", { name: /Compare/ });
  for (const route of [
    "Alternative offering",
    "Equivalent course",
    "Eligible elective",
    "Later semester",
  ])
    expect(screen.getByRole("list", { name: "Suggestions" })).toHaveTextContent(
      route,
    );
  const store = new PlanStore(indexedDB),
    original = (await store.load()).plans[0];
  await userEvent.click(screen.getAllByRole("button", { name: /Compare/ })[0]);
  const comparison = screen.getByRole("region", {
    name: "Compare this change",
  });
  expect(within(comparison).getByText("Uncertainty and limits")).toBeVisible();
  expect(within(comparison).getByText(/Why this position/)).toBeVisible();
  expect((await store.load()).plans[0]).toEqual(original);
  expect(
    within(comparison).getByRole("button", { name: "Apply this change" }),
  ).toBeDisabled();
  await userEvent.click(within(comparison).getByRole("checkbox"));
  await userEvent.click(
    within(comparison).getByRole("button", { name: "Apply this change" }),
  );
  await screen.findByText(
    "Change saved. Your previous plan is available with Undo.",
  );
  expect((await store.load()).plans[0]).not.toEqual(original);
  view.unmount();
  view = mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Undo last suggestion" }),
  );
  await screen.findByText("Previous plan restored exactly.");
  expect((await store.load()).plans[0]).toEqual(original);
  view.unmount();
});
