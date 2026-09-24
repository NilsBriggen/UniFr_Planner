import { expect, it } from "vitest";
import { printSourceNote } from "./print-source";
import { fromOffering } from "./domain";
import { publishedCourses } from "./published-fixture";
import { timetableMessages } from "./timetable-messages";

it("uses a publication date only for the matching saved snapshot", () => {
  const course = fromOffering(
    publishedCourses()[0].offerings[0],
    "c",
    "saved",
    false,
  );
  const status = { snapshot_id: "saved", published_at: "2026-09-23T21:06:39Z" };
  expect(printSourceNote([course], "en", status)).toContain("Sep 23, 2026");
  for (const changed of [
    undefined,
    { ...status, snapshot_id: "new" },
    { ...status, published_at: "invalid" },
  ])
    expect(printSourceNote([course], "en", changed)).toBe(
      timetableMessages.en.unpublished,
    );
  expect(
    printSourceNote(
      [course, { ...course, id: "other", offering: null }],
      "en",
      status,
    ),
  ).toBe(timetableMessages.en.unpublished);
  expect(printSourceNote([], "en", status)).toBe(
    timetableMessages.en.unpublished,
  );
});

it("labels a last validated source after rejection in every supported language", () => {
  const course = fromOffering(
    publishedCourses()[0].offerings[0],
    "c",
    "saved",
    false,
  );
  const status = {
    snapshot_id: "saved",
    published_at: "2026-09-23T21:06:39Z",
    latest_sync_outcome: "rejected_due_to_source_change",
  };
  expect(printSourceNote([course], "en", status)).toContain(
    "Last validated catalogue",
  );
  expect(printSourceNote([course], "de", status)).toContain(
    "Zuletzt validierter Katalog",
  );
  expect(printSourceNote([course], "fr", status)).toContain(
    "Dernier catalogue validé",
  );
});
