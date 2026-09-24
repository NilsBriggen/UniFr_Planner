import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

afterEach(() => vi.restoreAllMocks());

test("operations is localized, requires an explicit token and never stores it", async () => {
  localStorage.setItem("unifr.language", "de");
  const request = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      schedule: { timezone: "Europe/Zurich" },
      jobs: [{ id: "test-job", job: "catalogue", outcome: "rejected" }],
      state: {},
      sync_history: [],
      alert_hook_configured: false,
    }),
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(request);
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <App />
    </MemoryRouter>,
  );
  const input = await screen.findByLabelText("Administrations-Token");
  fireEvent.change(input, { target: { value: "private-operator-token" } });
  fireEvent.click(screen.getByRole("button", { name: "Betriebsdaten laden" }));
  expect(await screen.findByText(/rejected/)).toBeVisible();
  expect(request).toHaveBeenCalledWith(
    "/api/v1/admin/operations",
    expect.objectContaining({
      headers: { Authorization: "Bearer private-operator-token" },
    }),
  );
  expect(input).toHaveValue("");
  expect(JSON.stringify(localStorage)).not.toContain("private-operator-token");
});
