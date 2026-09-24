import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { publishedCourses, publishedStatus } from "./planner/published-fixture";
afterEach(() => vi.unstubAllGlobals());
it("leads spring detail and published-date preview with expanded spring occurrences, retaining autumn source records", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const c = publishedCourses()[0],
    o = c.offerings[0];
  const meeting = {
    ...o.meetings[0],
    starts_at: "2026-09-21T08:00:00Z",
    ends_at: "2026-09-21T09:00:00Z",
    recurrence: "FREQ=WEEKLY;COUNT=30",
  };
  o.terms = ["AS-2026", "SS-2027"];
  o.meetings = [meeting];
  const autumn = structuredClone(o);
  autumn.source_id = "autumn-only";
  autumn.terms = ["AS-2026"];
  autumn.lecturer = "Autumn lecturer";
  o.lecturer = "Annual lecturer";
  c.offerings = [autumn, o];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      Response.json(
        request.url.endsWith("/status/catalogue") ? publishedStatus : c,
      ),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/catalogue/" + c.code + "?term=SS-2027"]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText("Annual lecturer");
  expect(document.querySelector(".course-detail")).toHaveTextContent(
    "Annual lecturer",
  );
  const first = document.querySelector(".course-detail .meeting-list time")!;
  expect(first.getAttribute("datetime")).toBe("2027-02-01T09:00:00Z");
  fireEvent.click(
    screen.getAllByRole("button", { name: "View published meeting dates" })[0],
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    dialog.querySelector(".meeting-list time")!.getAttribute("datetime"),
  ).toBe("2027-02-01T09:00:00Z");
  expect(within(dialog).getByText("Other published terms")).toBeInTheDocument();
  expect(
    dialog.querySelector('time[datetime="2026-09-21T08:00:00Z"]'),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "View published meeting dates" })[0],
  ).toHaveFocus();
});
