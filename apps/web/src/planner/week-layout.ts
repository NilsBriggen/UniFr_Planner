import { Temporal } from "@js-temporal/polyfill";
import { zone, type CalendarEvent } from "./calendar";
export type WeekLesson = {
  event: CalendarEvent;
  start: string;
  end: string;
  startMinute: number;
  endMinute: number;
  lane: number;
  lanes: number;
};
export function layoutWeek(events: CalendarEvent[], monday: string) {
  const first = Temporal.PlainDate.from(monday);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = first.add({ days: index });
    const lower = day.toZonedDateTime(zone).epochMilliseconds;
    const upper = day.add({ days: 1 }).toZonedDateTime(zone).epochMilliseconds;
    const minute = (value: number) => {
      const local =
        Temporal.Instant.fromEpochMilliseconds(value).toZonedDateTimeISO(zone);
      return local.hour * 60 + local.minute + local.second / 60;
    };
    const lessons: WeekLesson[] = events
      .flatMap((event) => {
        const start = Math.max(lower, Date.parse(event.start)),
          end = Math.min(upper, Date.parse(event.end));
        if (start >= end) return [];
        return [
          {
            event,
            start:
              start === Date.parse(event.start)
                ? event.start
                : new Date(start).toISOString(),
            end:
              end === Date.parse(event.end)
                ? event.end
                : new Date(end).toISOString(),
            startMinute: start === lower ? 0 : minute(start),
            endMinute: end === upper ? 1440 : minute(end),
            lane: 0,
            lanes: 1,
          },
        ];
      })
      .sort(
        (a, b) =>
          a.startMinute - b.startMinute ||
          b.endMinute - a.endMinute ||
          a.event.id.localeCompare(b.event.id),
      );
    let group: WeekLesson[] = [],
      ends: number[] = [],
      groupEnd = -1;
    const finish = () => {
      group.forEach((lesson) => {
        lesson.lanes = ends.length;
      });
      group = [];
      ends = [];
    };
    for (const lesson of lessons) {
      if (lesson.startMinute >= groupEnd) {
        finish();
        groupEnd = -1;
      }
      let lane = ends.findIndex((end) => end <= lesson.startMinute);
      if (lane < 0) lane = ends.length;
      lesson.lane = lane;
      ends[lane] = lesson.endMinute;
      groupEnd = Math.max(groupEnd, lesson.endMinute);
      group.push(lesson);
    }
    finish();
    return { date: day.toString(), lessons };
  });
  const lessons = days.flatMap((day) => day.lessons);
  return {
    days,
    startMinute:
      Math.floor(Math.min(480, ...lessons.map((l) => l.startMinute)) / 60) * 60,
    endMinute:
      Math.ceil(Math.max(1080, ...lessons.map((l) => l.endMinute)) / 60) * 60,
  };
}
export function courseColour(owner: string) {
  return (
    [...owner].reduce(
      (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
      0,
    ) % 5
  );
}
