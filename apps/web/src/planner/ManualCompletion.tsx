import { useState, type FormEvent } from "react";
import { canonicalCourseCode } from "../../../../packages/domain/src/requirements";
import { Button } from "../components";
import type { Language } from "../i18n";
import { usePlans } from "./context";
import {
  activeScenario,
  isManualCode,
  recordCompleted,
  updateScenario,
  type Plan,
  type Selection,
} from "./domain";
import { plannerMessages } from "./messages";
import { catchupMessages } from "./catchup-messages";

export default function ManualCompletion({
  plan,
  language,
  record,
  onDone,
}: {
  plan: Plan;
  language: Language;
  record?: Selection;
  onDone?: () => void;
}) {
  const { save, busy } = usePlans();
  const t = plannerMessages[language],
    c = catchupMessages[language];
  const [error, setError] = useState(false);
  const [reserved, setReserved] = useState(false);
  const [pending, setPending] = useState<{
    course: Selection;
    existing: Selection;
    form: HTMLFormElement;
  }>();
  async function persist(
    course: Selection,
    form: HTMLFormElement,
    existingId?: string,
  ) {
    try {
      const next = record
        ? updateScenario(plan, (s) => ({
            ...s,
            courses: s.courses.map((item) => {
              if (item.id !== record.id) return item;
              if (item.pinned) throw new Error("pinned");
              return course;
            }),
          }))
        : recordCompleted(plan, [course], existingId ? [existingId] : []);
      if (await save(next)) {
        form.reset();
        setPending(undefined);
        onDone?.();
      } else setError(true);
    } catch {
      setError(true);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(false);
    setReserved(false);
    setPending(undefined);
    const form = event.currentTarget,
      data = new FormData(form);
    const code = String(data.get("code")).trim();
    if (/^MANUAL-/i.test(code)) {
      setReserved(true);
      return;
    }
    const course: Selection = {
      id: record?.id ?? crypto.randomUUID(),
      code:
        code ||
        (record && isManualCode(record.code)
          ? record.code
          : `MANUAL-${crypto.randomUUID()}`),
      titles: { ...record?.titles, [language]: String(data.get("title")) },
      ects: Number(data.get("ects")),
      semester: String(data.get("semester")) || null,
      status: "completed",
      pinned: false,
      offering: null,
    };
    const existing = activeScenario(plan).courses.find(
      (item) =>
        item.id !== record?.id &&
        canonicalCourseCode(item.code) === canonicalCourseCode(course.code),
    );
    if (existing) {
      setPending({ course, existing, form });
      return;
    }
    await persist(course, form);
  }
  return (
    <section className="completed-entry no-print">
      <h2>{record ? c.edit : c.manual}</h2>
      <form
        onSubmit={(e) => void submit(e)}
        onChange={() => setPending(undefined)}
      >
        <fieldset className="planner-fields" disabled={busy || record?.pinned}>
          <label>
            {t.courseTitle}
            <input
              name="title"
              maxLength={200}
              required
              defaultValue={
                record
                  ? (record.titles[language] ?? Object.values(record.titles)[0])
                  : ""
              }
            />
          </label>
          <label>
            {t.courseCode}
            <input
              aria-label={t.courseCode}
              name="code"
              maxLength={200}
              defaultValue={
                record && !isManualCode(record.code) ? record.code : ""
              }
            />
            <small>{c.optionalCode}</small>
          </label>
          <label>
            {t.completedEcts}
            <input
              name="ects"
              type="number"
              min="0"
              max="300"
              step="any"
              required
              defaultValue={record?.ects ?? ""}
            />
          </label>
          <label>
            {t.semester}
            <select name="semester" defaultValue={record?.semester ?? ""}>
              <option value="">{c.earlier}</option>
              {plan.semesters.map((term) => (
                <option key={term}>{term}</option>
              ))}
            </select>
          </label>
          <Button type="submit">{record ? c.update : t.addCompleted}</Button>
          {record && (
            <Button type="button" onClick={onDone}>
              {c.cancel}
            </Button>
          )}
        </fieldset>
      </form>
      {reserved && <p role="alert">{c.reserved}</p>}
      {pending && (
        <div role="status">
          <p>{pending.existing.pinned ? c.pinned : c.duplicate}</p>
          {!pending.existing.pinned && !record && (
            <Button
              disabled={busy}
              onClick={() =>
                void persist(pending.course, pending.form, pending.existing.id)
              }
            >
              {c.existing}
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert">{t.actionError}</p>}
    </section>
  );
}
