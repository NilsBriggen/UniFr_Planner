import { discoverCourses } from "./engine";
import type { Course } from "../api/client";
import type { Plan } from "../planner/domain";

self.onmessage = (
  event: MessageEvent<{
    plan: Plan;
    courses: Course[];
    term: string;
    language: string;
  }>,
) => {
  const { plan, courses, term, language } = event.data;
  try {
    self.postMessage({
      discovery: discoverCourses(plan, courses, term, language),
    });
  } catch {
    self.postMessage({ error: true });
  }
};
