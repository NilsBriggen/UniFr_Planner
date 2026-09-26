import { useState } from "react";
import { Button } from "../components";
import { shareMessages } from "../sharing/messages";
import { timetableMessages } from "./timetable-messages";
import { printWall } from "./wall-print";
import { downloadWeek, type WeeklyExport } from "./weekly-export";
import { printWeek } from "./weekly-print";
import "../sharing/sharing.css";
export default function WeeklyDownloads({
  input,
  hint,
}: {
  input: WeeklyExport;
  /** Shown under the buttons, e.g. to narrow attendance before printing. */
  hint?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const t = shareMessages[input.language];
  return (
    <div className="weekly-download-actions">
      <Button
        onClick={() => {
          setError(false);
          try {
            printWeek(input);
          } catch {
            setError(true);
          }
        }}
      >
        {t.print}
      </Button>
      <Button
        onClick={() => {
          setError(false);
          try {
            printWall(input);
          } catch {
            setError(true);
          }
        }}
      >
        {t.wallPrint} · A4 {timetableMessages[input.language].landscape}
      </Button>
      <Button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(false);
          void downloadWeek(input)
            .catch(() => setError(true))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? t.exporting : t.excel}
      </Button>
      {hint && <p className="schedule-warning">{hint}</p>}
      {error && <p role="alert">{t.exportError}</p>}
    </div>
  );
}
