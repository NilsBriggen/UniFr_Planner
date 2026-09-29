import { discoverCourses } from "./engine";
import type { Course } from "../api/client";
import type { Plan } from "../planner/domain";
import type { CalendarResult } from "../planner/calendar";

let courses: Course[] | undefined;
let calendars: Map<string, CalendarResult> | undefined;
self.onmessage = (
  event: MessageEvent<{
    requestId: number;
    plan: Plan;
    courses?: Course[];
    term: string;
    language: string;
    calendars?: Map<string, CalendarResult>;
  }>,
) => {
  const { requestId, plan, term, language } = event.data;
  try {
    if (event.data.courses) {
      courses = event.data.courses;
      calendars = event.data.calendars;
    }
    if (!courses) throw new Error("Discovery index missing");
    const discovery = discoverCourses(plan, courses, term, language, calendars);
    calendars = discovery.calendars;
    self.postMessage({
      requestId,
      discovery,
    });
  } catch {
    self.postMessage({ requestId, error: true });
  }
};
