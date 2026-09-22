import type { ReactNode } from "react";
import { Button } from "../components";
import type { Language } from "../i18n";
import { usePlans } from "./context";
import { plannerMessages } from "./messages";

export function Download({
  text,
  filename,
  type,
  children,
}: {
  text: string;
  filename: string;
  type: string;
  children: ReactNode;
}) {
  return (
    <Button
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      {children}
    </Button>
  );
}

export function SaveStatus({ language }: { language: Language }) {
  const { ready, busy, error, plan, unreadableIds } = usePlans();
  const t = plannerMessages[language];
  return (
    <>
      {unreadableIds.length > 0 && (
        <p role="alert" className="planner-error">
          {t.unreadable} ({unreadableIds.length})
        </p>
      )}
      <p
        role={error ? "alert" : "status"}
        className={error ? "planner-error" : "save-status"}
      >
        {error
          ? t.storageError
          : !ready
            ? t.loading
            : busy
              ? t.saving
              : plan
                ? t.saved
                : t.localHelp}
      </p>
    </>
  );
}
