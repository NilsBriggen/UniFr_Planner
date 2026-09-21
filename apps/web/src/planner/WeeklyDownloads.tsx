import { useState } from "react";
import { Button } from "../components";
import { shareMessages } from "../sharing/messages";
import { downloadWeek, type WeeklyExport } from "./weekly-export";
import { printWeek } from "./weekly-print";
import "../sharing/sharing.css";
export default function WeeklyDownloads({ input }: { input: WeeklyExport }) {
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
      {error && <p role="alert">{t.exportError}</p>}
    </div>
  );
}
