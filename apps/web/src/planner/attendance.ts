import type { Selection } from "./domain";
type Meeting = NonNullable<Selection["offering"]>["meetings"][number];
// These are change detectors, never security credentials or inferred group IDs.
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}-${a >>> 0}-${b >>> 0}`;
}
export const meetingKey = (meeting: Meeting, index: number) =>
  `${index}-${fingerprint(meeting)}`;
const sourceFingerprint = (course: Selection) => fingerprint(course.offering);
export function attendanceChoice(
  course: Selection,
  excluded: number[],
): Selection["attendance"] {
  const meetings = course.offering?.meetings ?? [];
  if (
    excluded.some((i) => !Number.isInteger(i) || i < 0 || i >= meetings.length)
  )
    throw new Error("unknown source session");
  if (!excluded.length) return undefined;
  return {
    sourceFingerprint: sourceFingerprint(course),
    excludedMeetingKeys: [...new Set(excluded)].map((i) =>
      meetingKey(meetings[i], i),
    ),
    provisional: true,
  };
}
export function selectedMeetings(course: Selection) {
  const meetings = course.offering?.meetings ?? [];
  const choice = course.attendance;
  const known = new Set(meetings.map(meetingKey));
  const stale = Boolean(
    choice &&
      (choice.sourceFingerprint !== sourceFingerprint(course) ||
        choice.excludedMeetingKeys.some((k) => !known.has(k))),
  );
  return {
    meetings:
      !choice || stale
        ? meetings
        : meetings.filter(
            (m, i) => !choice.excludedMeetingKeys.includes(meetingKey(m, i)),
          ),
    stale,
    unresolved: Boolean(choice),
  };
}
/** Convenience batch selection, not an assertion of official academic groups. */
export function attendanceSeries(course: Selection) {
  const groups = new Map<string, { meeting: Meeting; indices: number[] }>();
  const local = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zurich",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  for (const [i, meeting] of (course.offering?.meetings ?? []).entries()) {
    const key =
      meeting.starts_at && meeting.ends_at
        ? JSON.stringify([
            meeting.note,
            meeting.location,
            local(meeting.starts_at),
            local(meeting.ends_at),
            meeting.cancelled,
            meeting.recurrence ?? null,
            Boolean(meeting.recurrence_id),
          ])
        : String(i);
    const group = groups.get(key) ?? { meeting, indices: [] };
    group.indices.push(i);
    groups.set(key, group);
  }
  return [...groups.values()];
}
