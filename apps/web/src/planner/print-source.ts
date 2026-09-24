import type { CatalogueStatus } from "../api/client";
import type { Language } from "../i18n";
import type { Selection } from "./domain";
import { timetableMessages } from "./timetable-messages";

export type PrintSourceStatus = Pick<
  CatalogueStatus,
  "snapshot_id" | "published_at" | "latest_sync_outcome"
>;

/** A fresh catalogue timestamp must never be attributed to older saved courses. */
export function printSourceNote(
  courses: Selection[],
  language: Language,
  status?: PrintSourceStatus,
) {
  const date = status?.published_at ? new Date(status.published_at) : undefined;
  if (
    !courses.length ||
    !status?.snapshot_id ||
    !date ||
    !Number.isFinite(date.getTime()) ||
    courses.some(
      (course) =>
        !course.offering ||
        course.offering.development_fixture ||
        course.offering.snapshot_id !== status.snapshot_id,
    )
  )
    return timetableMessages[language].unpublished;
  const label = {
    en: "Catalogue published",
    de: "Katalog veröffentlicht",
    fr: "Catalogue publié",
  }[language];
  const retained = {
    en: "Last validated catalogue; newer import requires review",
    de: "Zuletzt validierter Katalog; neuerer Import muss geprüft werden",
    fr: "Dernier catalogue validé ; une importation plus récente doit être vérifiée",
  }[language];
  return `${label}: ${date.toLocaleString(language, {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
    timeStyle: "short",
  })}${status.latest_sync_outcome?.startsWith("rejected") ? ` · ${retained}` : ""}`;
}
