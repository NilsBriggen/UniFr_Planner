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
import { Temporal } from "@js-temporal/polyfill";
import { PlanStore } from "./storage";
import { createPlan, type Selection, type Unavailable } from "./domain";
import { plannerMessages } from "./messages";
import { attendanceChoice } from "./attendance";
import { shareMessages } from "../sharing/messages";
import { timetableMessages } from "./timetable-messages";
import { localDate, weeklyRepeats, zone } from "./calendar";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

async function mountCalendar(
  language: Language,
  date: string,
  cancelled = false,
  {
    weeks = 1,
    edit,
    unavailable = [],
  }: {
    weeks?: number;
    edit?: (c: Selection) => void;
    unavailable?: Unavailable[];
  } = {},
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
        // Weekly dates stay before 28.03.2027, so local times do not shift.
        meetings: Array.from({ length: weeks }, (_, i) => {
          const day = Temporal.PlainDate.from(date).add({ days: 7 * i });
          return {
            starts_at: `${day}T10:00:00Z`,
            ends_at: `${day}T11:00:00Z`,
            location: "PER 21",
            unresolved: false,
            cancelled,
            excluded_dates: [],
            additional_dates: [],
            note: "",
          };
        }),
      },
    },
  ];
  edit?.(plan.scenarios[0].courses[0]);
  plan.scenarios[0].unavailable = unavailable;
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

const wallButton = (language: Language) =>
  within(document.querySelector(".calendar-exports") as HTMLElement).getByRole(
    "button",
    {
      name: `${shareMessages[language].wallPrint} · A4 ${timetableMessages[language].landscape}`,
    },
  );
function stubPrintWindow(blocked = false) {
  const written: string[] = [];
  const preview = {
    opener: {},
    focus: vi.fn(),
    print: vi.fn(),
    document: {
      open: vi.fn(),
      write: (html: string) => written.push(html),
      close: vi.fn(),
      getElementById: () => ({}),
    },
  };
  const open = vi
    .spyOn(window, "open")
    .mockReturnValue(blocked ? null : (preview as unknown as Window));
  return { open, written };
}

it.each<Language>(["en", "de", "fr"])(
  "prints the typical week as a one-page wall timetable in %s",
  async (language) => {
    await mountCalendar(language, "2027-03-01", false, { weeks: 3 });
    const { open, written } = stubPrintWindow();
    try {
      await userEvent.click(wallButton(language));
      expect(open).toHaveBeenCalledWith("", "_blank");
      const html = written.join("");
      expect(html).toContain("@page{size:A4 landscape");
      const doc = new DOMParser().parseFromString(html, "text/html");
      expect(doc.querySelectorAll(".wall-sheet")).toHaveLength(1);
      expect(doc.querySelector(".wall-head strong")!.textContent).toContain(
        timetableMessages[language].typicalWeek,
      );
      expect(doc.querySelector(".wall-block")!.textContent).toContain(
        "Two-term course",
      );
      expect(doc.querySelector(".wall-block .time")!.textContent).toBe(
        "11:00–12:00",
      );
      expect(
        within(
          document.querySelector(".calendar-exports") as HTMLElement,
        ).queryByRole("alert"),
      ).not.toBeInTheDocument();
    } finally {
      open.mockRestore();
    }
  },
);

it("reports a blocked wall timetable window next to the button", async () => {
  await mountCalendar("fr", "2027-03-01", false, { weeks: 3 });
  const { open } = stubPrintWindow(true);
  try {
    await userEvent.click(wallButton("fr"));
    expect(
      within(
        document.querySelector(".calendar-exports") as HTMLElement,
      ).getByRole("alert"),
    ).toHaveTextContent(shareMessages.fr.exportError);
  } finally {
    open.mockRestore();
  }
});

it.each([false, true])(
  "asks to choose attendance before printing parallel sessions (chosen=%s)",
  async (chosen) => {
    await mountCalendar("en", "2027-03-01", false, {
      edit: (course) => {
        const [meeting] = course.offering!.meetings;
        course.offering!.meetings = ["PER 21", "PER 08", "MIS 03"].map(
          (location) => ({ ...meeting, location }),
        );
        // Two groups still overlap after the choice; the choice was made.
        if (chosen) course.attendance = attendanceChoice(course, [2]);
      },
    });
    const exports = within(
      document.querySelector(".calendar-exports") as HTMLElement,
    );
    const hint = timetableMessages.en.wallAttendanceHint;
    if (chosen) expect(exports.queryByText(hint)).not.toBeInTheDocument();
    else expect(exports.getByText(hint)).toBeVisible();
  },
);

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
/** The visible summary of each top-level unavailable row. */
const unavailableRows = () =>
  [...document.querySelectorAll(".unavailable-list > li")].map(
    (row) =>
      row.querySelector(":scope > span, :scope > details > summary")!
        .textContent,
  );
const weekly = (label: string, start: string, end: string, until: string) =>
  weeklyRepeats(start, end, until)!.map((period, i) => ({
    id: `${label}-${start.slice(0, 10)}-${i}`,
    label,
    ...period,
  }));

it.each<[Language, string, string]>([
  ["en", "Job · Mon 18:00–22:00 · 6× (01.03.–05.04.)", "Mar 10, 2027"],
  ["de", "Job · Mo 18:00–22:00 · 6× (01.03.–05.04.)", "10.03.2027"],
  ["fr", "Job · lun. 18:00–22:00 · 6× (01.03.–05.04.)", "10 mars 2027"],
])(
  "repeats an unavailable period weekly as one removable row in %s",
  async (language, row, dentistDate) => {
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
    await waitFor(() =>
      expect(unavailableRows()).toEqual([row, `Dentist · ${dentistDate}`]),
    );
    // Each name starts with the visible button text and names its row.
    expect(
      list.getByRole("button", {
        name: `${t.removeBusy} · Dentist · ${dentistDate}`,
      }),
    ).toBeVisible();
    await userEvent.click(
      list.getByRole("button", { name: `${t.removeAll} · ${row}` }),
    );
    await waitFor(() => expect(unavailableRows()).toHaveLength(1));
    expect((await storedPeriods()).map((p) => p.label)).toEqual(["Dentist"]);
  },
);

it("groups only unbroken weekly runs and keeps each date removable", async () => {
  const dentist = (day: string) =>
    weekly("Dentist", `${day}T09:00`, `${day}T10:00`, day);
  await mountCalendar("en", "2027-03-01", false, {
    unavailable: [
      ...weekly("Job", "2026-09-21T18:00", "2026-09-21T22:00", "2026-12-14"),
      ...weekly("Job", "2027-02-22T18:00", "2027-02-22T22:00", "2027-05-31"),
      ...dentist("2026-10-05"),
      ...dentist("2027-03-01"),
      ...weekly("Choir", "2026-12-02T19:00", "2026-12-02T21:00", "2027-01-13"),
    ],
  });
  const t = plannerMessages.en;
  const list = within(
    document.querySelector(".unavailable-list") as HTMLElement,
  );
  const choir = "Choir · Wed 19:00–21:00";
  expect(unavailableRows()).toEqual([
    "Job · Mon 18:00–22:00 · 13× (21.09.–14.12.)",
    "Job · Mon 18:00–22:00 · 15× (22.02.–31.05.)",
    "Dentist · Oct 5, 2026",
    "Dentist · Mar 1, 2027",
    `${choir} · 7× (02.12.2026–13.01.2027)`,
  ]);

  await userEvent.click(
    list.getByRole("button", {
      name: `${t.removeBusy} · Dentist · Oct 5, 2026`,
    }),
  );
  await waitFor(() => expect(unavailableRows()).toHaveLength(4));
  expect(
    (await storedPeriods())
      .filter((p) => p.label === "Dentist")
      .map((p) => p.start),
  ).toEqual(["2027-03-01T08:00:00Z"]);

  // A week off inside a run removes one date and splits the run at the gap.
  await userEvent.click(
    list.getByText(`${choir} · 7× (02.12.2026–13.01.2027)`),
  );
  await userEvent.click(
    list.getByRole("button", {
      name: `${t.removeBusy} · ${choir} · Dec 23, 2026`,
    }),
  );
  await waitFor(() =>
    expect(unavailableRows().slice(-2)).toEqual([
      `${choir} · 3× (02.12.–16.12.)`,
      `${choir} · 3× (30.12.2026–13.01.2027)`,
    ]),
  );
  expect(
    (await storedPeriods()).filter((p) => p.label === "Choir"),
  ).toHaveLength(6);
});

it("gives every removal a distinct name for same-label series", async () => {
  await mountCalendar("en", "2027-03-01", false, {
    unavailable: [
      ...weekly("Job", "2027-03-01T18:00", "2027-03-01T22:00", "2027-04-05"),
      ...weekly("Job", "2027-03-04T18:00", "2027-03-04T22:00", "2027-04-08"),
    ],
  });
  const t = plannerMessages.en;
  const list = document.querySelector(".unavailable-list") as HTMLElement;
  const monday = "Job · Mon 18:00–22:00 · 6× (01.03.–05.04.)",
    thursday = "Job · Thu 18:00–22:00 · 6× (04.03.–08.04.)";
  expect(unavailableRows()).toEqual([monday, thursday]);
  const names = [...list.querySelectorAll("button")].map((button) =>
    button.getAttribute("aria-label"),
  );
  expect(names).toHaveLength(14);
  expect(new Set(names).size).toBe(names.length);

  await userEvent.click(
    within(list).getByRole("button", { name: `${t.removeAll} · ${thursday}` }),
  );
  await waitFor(() => expect(unavailableRows()).toEqual([monday]));
  expect(
    (await storedPeriods()).map(
      (p) => Temporal.Instant.from(p.start).toZonedDateTimeISO(zone).dayOfWeek,
    ),
  ).toEqual(Array(6).fill(1));
});

it("keeps a weekly run whose DST-switch week was skipped as one row", async () => {
  await mountCalendar("en", "2027-03-01");
  await addPeriod(
    "en",
    "Night shift",
    "2027-03-14T02:30",
    "2027-03-14T03:30",
    "2027-04-11",
  );
  // 28.03.2027 02:30 does not exist in Zurich, so that week is skipped.
  await waitFor(() =>
    expect(unavailableRows()).toEqual([
      "Night shift · Sun 02:30–03:30 · 4× (14.03.–11.04.)",
    ]),
  );
  expect((await storedPeriods()).map((p) => localDate(p.start))).toEqual([
    "2027-03-14",
    "2027-03-21",
    "2027-04-04",
    "2027-04-11",
  ]);
});

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
