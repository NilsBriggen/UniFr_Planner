import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import App from "../App";
import { type Language } from "../i18n";
import { PlanStore } from "./storage";
import { createPlan } from "./domain";
import { plannerMessages } from "./messages";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

async function mountCalendar(
  language: Language,
  date: string,
  cancelled = false,
) {
  localStorage.setItem("unifr.language", language);
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "Degree",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 2,
    targetEcts: 12,
  });
  plan.scenarios[0].courses = [
    {
      id: "course",
      code: "COURSE",
      titles: { en: "Two-term course" },
      ects: 6,
      status: "planned",
      semester: "SS-2027",
      pinned: false,
      offering: {
        source_id: "source",
        terms: ["AS-2026", "SS-2027"],
        meeting_state: "resolved",
        source_url: "https://www.unifr.ch",
        snapshot_id: "snapshot",
        development_fixture: false,
        meetings: [
          {
            starts_at: `${date}T10:00:00Z`,
            ends_at: `${date}T11:00:00Z`,
            location: "PER 21",
            unresolved: false,
            cancelled,
            excluded_dates: [],
            additional_dates: [],
            note: "",
          },
        ],
      },
    },
  ];
  await new PlanStore(indexedDB).save(plan, null);
  const app = render(
    <MemoryRouter initialEntries={["/semester/SS-2027"]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", {
    name: plannerMessages[language].conflictHeading,
  });
  await userEvent.click(
    screen.getByText(
      {
        en: "Print and download",
        de: "Drucken und herunterladen",
        fr: "Imprimer et télécharger",
      }[language],
      { selector: "summary" },
    ),
  );
  return app;
}

it.each<Language>(["en", "de", "fr"])(
  "shows missing term evidence and disables export in %s",
  async (language) => {
    await mountCalendar(language, "2026-09-21");
    const t = plannerMessages[language];
    expect(screen.getByRole("heading", { name: t.unresolved })).toBeVisible();
    expect(screen.getByText(t.unresolvedHelp)).toBeVisible();
    expect(screen.getByText("Two-term course")).toBeVisible();
    expect(screen.queryByText(t.clear)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.exportIcs })).toBeDisabled();
  },
);

it.each([false, true])(
  "allows export for dated in-term evidence with cancelled=%s",
  async (cancelled) => {
    const app = await mountCalendar("en", "2027-03-01", cancelled);
    const t = plannerMessages.en;
    expect(screen.getByText(t.clear)).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: t.unresolved }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.exportIcs })).toBeEnabled();
    const calendar = within(
      app.container.querySelector(".screen-calendar") as HTMLElement,
    );
    expect(calendar.getByText("Two-term course")).toBeVisible();
    if (cancelled)
      expect(
        calendar.getByRole("heading", { name: t.cancelled }),
      ).toBeVisible();
  },
);

it("opens the current week and can return to it after browsing another day", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-03-17T10:00:00Z"));
  try {
    await mountCalendar("en", "2027-03-01");
    const user = userEvent.setup();
    expect(screen.getByLabelText("Date")).toHaveValue("2027-03-17");
    await user.click(screen.getByRole("button", { name: "Day" }));
    await user.clear(screen.getByLabelText("Date"));
    await user.type(screen.getByLabelText("Date"), "2027-03-10");
    await user.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getByLabelText("Date")).toHaveValue("2027-03-17");
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    vi.useRealTimers();
  }
});

async function addPeriod(
  language: Language,
  label: string,
  start: string,
  end: string,
  repeatUntil = "",
) {
  const t = plannerMessages[language];
  const form = screen.getByText(t.addBusy, { selector: "summary" });
  if (!form.parentElement?.hasAttribute("open")) await userEvent.click(form);
  await userEvent.clear(screen.getByLabelText(t.busyLabel));
  await userEvent.type(screen.getByLabelText(t.busyLabel), label);
  fireEvent.change(screen.getByLabelText(t.starts), {
    target: { value: start },
  });
  fireEvent.change(screen.getByLabelText(t.ends), { target: { value: end } });
  fireEvent.change(screen.getByLabelText(t.repeatUntil), {
    target: { value: repeatUntil },
  });
  await userEvent.click(screen.getByRole("button", { name: t.addBusy }));
}
const storedPeriods = async () =>
  (await new PlanStore(indexedDB).load()).plans[0].scenarios[0].unavailable;

it.each<[Language, string]>([
  ["en", "Job · Mon 18:00–22:00 · 6× (01.03.–05.04.)"],
  ["de", "Job · Mo 18:00–22:00 · 6× (01.03.–05.04.)"],
  ["fr", "Job · lun. 18:00–22:00 · 6× (01.03.–05.04.)"],
])(
  "repeats an unavailable period weekly as one removable row in %s",
  async (language, row) => {
    await mountCalendar(language, "2027-03-01");
    const t = plannerMessages[language];
    await addPeriod(
      language,
      "Job",
      "2027-03-01T18:00",
      "2027-03-01T22:00",
      "2027-04-05",
    );
    expect(await screen.findByText(row)).toBeVisible();
    const periods = await storedPeriods();
    expect(periods.map((p) => p.start)).toEqual([
      "2027-03-01T17:00:00Z",
      "2027-03-08T17:00:00Z",
      "2027-03-15T17:00:00Z",
      "2027-03-22T17:00:00Z",
      "2027-03-29T16:00:00Z",
      "2027-04-05T16:00:00Z",
    ]);
    expect(new Set(periods.map((p) => p.id)).size).toBe(6);
    expect(periods.every((p) => p.label === "Job")).toBe(true);

    await addPeriod(
      language,
      "Dentist",
      "2027-03-10T09:00",
      "2027-03-10T10:00",
    );
    const list = within(
      document.querySelector(".unavailable-list") as HTMLElement,
    );
    await waitFor(() => expect(list.getAllByRole("listitem")).toHaveLength(2));
    expect(
      list.getByRole("button", { name: `${t.removeBusy} · Dentist` }),
    ).toBeVisible();
    await userEvent.click(
      list.getByRole("button", { name: `${t.removeAll} · Job` }),
    );
    await waitFor(() => expect(list.getAllByRole("listitem")).toHaveLength(1));
    expect((await storedPeriods()).map((p) => p.label)).toEqual(["Dentist"]);
  },
);

it("refuses weekly repeats beyond the plan limit or before the start", async () => {
  await mountCalendar("en", "2027-03-01");
  const t = plannerMessages.en;
  await addPeriod(
    "en",
    "Job",
    "2027-03-01T18:00",
    "2027-03-01T22:00",
    "2037-03-02",
  );
  expect(await screen.findByText(t.invalidPeriod)).toBeVisible();
  await addPeriod(
    "en",
    "Job",
    "2027-03-01T18:00",
    "2027-03-01T22:00",
    "2027-02-28",
  );
  expect(screen.getByText(t.invalidPeriod)).toBeVisible();
  expect(await storedPeriods()).toEqual([]);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
