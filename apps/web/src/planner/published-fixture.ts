import type { CatalogueStatus, Course, Offering } from "../api/client";
import { createExample } from "../suggestions/seed";
import { bindProgramme } from "../requirements/adapter";
import type { Selection } from "./domain";

export const publishedStatus: CatalogueStatus = {
  availability: "available",
  snapshot_id: "published-2",
  stale: false,
  development_fixture: false,
};
export function publishedPlan() {
  const plan = createExample("real-plan", "CS and Business Informatics");
  plan.programme = "CS + BI";
  plan.targetEcts = 180;
  plan.scenarios[0].courses.forEach((course, i) => {
    course.code = i === 0 ? "SIN.01023" : "SIN.01024";
    course.titles = { en: i === 0 ? "Programming" : "Mathematics" };
    course.offering!.development_fixture = false;
    course.offering!.snapshot_id = "published-1";
    course.offering!.source_url = `https://www.unifr.ch/timetable/${course.code}`;
  });
  return bindProgramme(
    bindProgramme(plan, {
      code: "CS-120",
      version: "2024.1",
      cohort: 2024,
    }),
    { code: "BI-CS-60", version: "2024.1", cohort: 2024 },
  );
}
export function publicOffering(selection: Selection): Offering {
  return {
    ...selection.offering!,
    course: { code: selection.code, titles: selection.titles },
    ects: selection.ects,
    languages: ["en"],
    levels: ["Bachelor"],
    lecturer: "",
    faculty_domain: "",
    schedule_summary: "",
    recurrence_summary: "",
    assessment: "",
    prerequisites: "None",
    equivalents: "",
    assignments: [],
    calendar_url: null,
    listing_fingerprint: "list",
    detail_hash: "detail",
  };
}
export function publishedCourses(): Course[] {
  return publishedPlan().scenarios[0].courses.map((course, index) => {
    const offering = publicOffering(course);
    const alternative = structuredClone(offering);
    alternative.source_id = "alternative-programming";
    alternative.meetings[0].starts_at = "2026-09-21T11:00:00Z";
    alternative.meetings[0].ends_at = "2026-09-21T12:00:00Z";
    return {
      code: course.code,
      titles: course.titles,
      offerings: index === 0 ? [offering, alternative] : [offering],
    };
  });
}
