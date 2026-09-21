import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components";
import type { Language } from "../i18n";
import { usePlans } from "../planner/context";
import { useSharing } from "./context";
import { shareMessages } from "./messages";
import "./sharing.css";

export default function SharePanel({ language }: { language: Language }) {
  const { plan, busy } = usePlans();
  const sharing = useSharing();
  const t = shareMessages[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const [personal, setPersonal] = useState(false),
    [error, setError] = useState(false),
    [copied, setCopied] = useState(false),
    [working, setWorking] = useState(false);
  if (!plan) return null;
  const record = sharing.records.find((r) => r.planId === plan.id);
  const state = sharing.statuses[plan.id];
  const link = record?.id ? `${location.origin}/shared/${record.id}` : "";
  async function action(run: () => Promise<void>) {
    setWorking(true);
    setError(false);
    try {
      await run();
    } catch {
      setError(true);
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <Button onClick={() => dialog.current?.showModal()}>{t.share}</Button>
      <dialog
        ref={dialog}
        className="share-dialog"
        aria-labelledby="share-heading"
        onClose={() => {
          setError(false);
          setCopied(false);
        }}
      >
        <div className="share-dialog-heading">
          <h2 id="share-heading">{t.title}</h2>
          <Button onClick={() => dialog.current?.close()} aria-label={t.close}>
            ×
          </Button>
        </div>
        <p>{t.intro}</p>
        <p className="planner-help">{t.privacy}</p>
        {link ? (
          <>
            <label>
              {t.link}
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </label>
            <div className="actions">
              <Button
                className="primary"
                onClick={() =>
                  void action(async () => {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  })
                }
              >
                {copied ? t.copied : t.copy}
              </Button>
              <Link
                to={`/shared/${record!.id}`}
                onClick={() => dialog.current?.close()}
              >
                {t.open}
              </Link>
            </div>
            <p role="status">{state ? t[state] : t.synced}</p>
            {(state === "offline" || state === "publishing") && (
              <Button disabled={state === "publishing"} onClick={sharing.retry}>
                {t.retry}
              </Button>
            )}
            <Button
              disabled={working || state === "publishing"}
              onClick={() => {
                if (confirm(t.revokeConfirm))
                  void action(() => sharing.revoke(record!));
              }}
            >
              {t.revoke}
            </Button>
          </>
        ) : (
          <>
            <label className="share-personal">
              <input
                type="checkbox"
                checked={personal}
                onChange={(e) => setPersonal(e.target.checked)}
              />
              {t.personal}
            </label>
            <Button
              className="primary"
              disabled={!sharing.ready || busy || working}
              onClick={() => void action(() => sharing.create(plan, personal))}
            >
              {working ? t.publishing : t.create}
            </Button>
          </>
        )}
        <p className="planner-help">{t.localOwner}</p>
        {error && <p role="alert">{t.error}</p>}
      </dialog>
      {record?.id && state && state !== "synced" && (
        <p
          className="share-status"
          role={state === "publishing" ? "status" : "alert"}
        >
          {t[state]}
        </p>
      )}
    </>
  );
}
