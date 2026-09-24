import type { Offering } from "../api/client";
import type { Discovery } from "./engine";
import { localDate, type CalendarEvent } from "../planner/calendar";
export const offeringKey = (offering: Offering) =>
  `${offering.course.code}:${offering.source_id}`;

export function filterDiscovery(
  discovery: Discovery,
  options: { programme?: boolean; mode?: "requirements" | "programme" | "all"; fits: boolean; hideAdded: boolean },
) {
  const mode = options.mode ?? (options.programme ? "programme" : "all");
  return discovery.courses.flatMap((course) => {
    const offerings = course.offerings.filter((offering) => {
      const a = discovery.assessments.get(offeringKey(offering))!;
      return (
        (mode === "all" || (mode === "requirements" ? a.recommended : a.recommended || a.sourceAssignments.length > 0)) &&
        (!options.fits || a.fit === "fits") &&
        (!options.hideAdded || !a.selected)
      );
    });
    return offerings.length ? [{ ...course, offerings }] : [];
  });
}

/** Group actual expanded dates; never describe irregular source dates as a weekly recurrence. */
export function lessonGroups(events: CalendarEvent[], language: string) {
  const stamp = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, {
      timeZone: "Europe/Zurich",
      ...options,
    }).format(new Date(value));
  const groups = new Map<
    string,
    { time: string; location: string; dates: string[] }
  >();
  for (const event of events) {
    const time = `${stamp(event.start, { weekday: "short" })} ${stamp(event.start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}–${stamp(event.end, { weekday: localDate(event.start) !== localDate(event.end) ? "short" : undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
    const key = `${time}:${event.location}`;
    const group = groups.get(key) ?? {
      time,
      location: event.location,
      dates: [],
    };
    group.dates.push(stamp(event.start, { day: "numeric", month: "short" }));
    groups.set(key, group);
  }
  return [...groups.values()];
}
