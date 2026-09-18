import { useEffect, useRef, useState } from "react";
import createClient from "openapi-fetch";
import type { components, paths } from "../api/schema";
import type { Language } from "../i18n";
import { Button } from "../components";
import { usePlans } from "../planner/context";
import { parsePlan } from "../planner/domain";
import { accountMessages } from "./messages";
import "./accounts.css";

type Cloud = components["schemas"]["SavedPlan"];
type Link = { id: string; revision: number };
const client = () =>
  createClient<paths>({
    baseUrl: window.location.origin,
    fetch: (request) => fetch(request),
  });
class Failure extends Error {
  constructor(readonly status: number) {
    super("Account action failed");
  }
}
function required<T>(result: { data?: T; response: Response }): T {
  if (!result.response.ok || result.data === undefined)
    throw new Failure(result.response.status);
  return result.data;
}
function linksFor(username: string): Record<string, Link> {
  try {
    return JSON.parse(sessionStorage.getItem(`unifr.sync.${username}`) ?? "{}");
  } catch {
    return {};
  }
}
function remember(username: string, localId: string, plan: Cloud) {
  try {
    sessionStorage.setItem(
      `unifr.sync.${username}`,
      JSON.stringify({
        ...linksFor(username),
        [localId]: { id: plan.id, revision: plan.revision },
      }),
    );
  } catch {
    /* Without session storage, sync safely makes a new server copy. */
  }
}

export default function Accounts({ language }: { language: Language }) {
  const t = accountMessages[language],
    local = usePlans();
  const [username, setUsername] = useState<string | null>(null);
  const [cloud, setCloud] = useState<Cloud[]>([]);
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [recovery, setRecovery] = useState("");
  const [notice, setNotice] = useState<
    "error" | "limited" | "done" | "conflict" | "copied" | "importing" | null
  >(null);
  const [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(true);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void client()
      .GET("/api/v1/account/session")
      .then(async (result) => {
        if (!active) return;
        if (result.data) {
          setUsername(result.data.username);
          const list = required(await client().GET("/api/v1/account/plans"));
          if (active) setCloud(list.plans);
        } else if (result.response.status !== 401) setNotice("error");
      })
      .catch(() => {
        if (active) setNotice("error");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice(
        error instanceof Failure && error.status === 429 ? "limited" : "error",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    const result = required(await client().GET("/api/v1/account/plans"));
    // Reject malformed server snapshots before offering any local copies.
    result.plans.forEach((p) => parsePlan(JSON.stringify(p.snapshot)));
    setCloud(result.plans);
  }
  async function authenticate(form: HTMLFormElement) {
    const fields = new FormData(form);
    const body = {
      username: String(fields.get("username")),
      password: String(fields.get("password")),
    };
    const result =
      mode === "recover"
        ? required(
            await client().POST("/api/v1/account/recover", {
              body: {
                ...body,
                recoveryCode: String(fields.get("recoveryCode")),
              },
            }),
          )
        : mode === "register"
          ? required(await client().POST("/api/v1/account/register", { body }))
          : required(await client().POST("/api/v1/account/login", { body }));
    form.reset();
    setUsername(result.username);
    setRecovery("recoveryCode" in result ? String(result.recoveryCode) : "");
    setCloud([]);
    try {
      if (local.plans.length) {
        const copies = required(
          await client().POST("/api/v1/account/plans/import", {
            body: { plans: local.plans },
          }),
        );
        copies.plans.forEach((plan, index) =>
          remember(result.username, local.plans[index].id, plan),
        );
      }
      await refresh();
      setNotice("done");
    } catch {
      setNotice("importing");
    }
  }
  async function synchronize() {
    if (!username || !local.plan) return;
    const link = linksFor(username)[local.plan.id];
    if (!link) {
      const result = required(
        await client().POST("/api/v1/account/plans/import", {
          body: { plans: [local.plan] },
        }),
      );
      remember(username, local.plan.id, result.plans[0]);
      setNotice("done");
    } else {
      const result = await client().PUT("/api/v1/account/plans/{identifier}", {
        params: { path: { identifier: link.id } },
        body: {
          revision: link.revision,
          snapshot: { ...local.plan, id: link.id },
        },
      });
      if (result.response.status === 409) {
        const conflict = result.error;
        if (!conflict || !("conflict" in conflict) || !conflict.conflict)
          throw new Failure(409);
        remember(username, local.plan.id, conflict.conflict);
        setNotice("conflict");
      } else {
        remember(username, local.plan.id, required(result).plan);
        setNotice("done");
      }
    }
    await refresh();
  }
  async function signout() {
    const result = await client().POST("/api/v1/account/logout");
    if (!result.response.ok) throw new Failure(result.response.status);
    setUsername(null);
    setCloud([]);
    setRecovery("");
    setDeleting(false);
  }
  async function exportAccount() {
    const archive = required(await client().GET("/api/v1/account/export"));
    if (archive.schemaVersion !== 1) throw new Error("Invalid archive");
    archive.plans.forEach((p) => parsePlan(JSON.stringify(p.snapshot)));
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(archive, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "unifr-account-v1.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="page account-page" aria-busy={busy || checking}>
      <h1>{t.title}</h1>
      <p>{t.intro}</p>
      <p>{t.local}</p>
      {notice && (
        <p
          role={
            notice === "error" || notice === "limited" || notice === "importing"
              ? "alert"
              : "status"
          }
          className="notice"
        >
          {t[notice]}
        </p>
      )}
      {!username ? (
        <>
          <div className="actions" role="group" aria-label={t.title}>
            {(["login", "register", "recover"] as const).map((value) => (
              <Button
                key={value}
                disabled={busy}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setNotice(null);
                }}
              >
                {t[value]}
              </Button>
            ))}
          </div>
          <form
            key={mode}
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              void run(() => authenticate(form));
            }}
          >
            <p id="account-rules">{t.rules}</p>
            <label>
              {t.username}
              <input
                name="username"
                autoComplete="username"
                pattern="[a-zA-Z0-9_-]{3,32}"
                minLength={3}
                maxLength={32}
                required
                aria-describedby="account-rules"
              />
            </label>
            <label>
              {t.password}
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={12}
                maxLength={128}
                required
                aria-describedby="account-rules"
              />
            </label>
            {mode === "recover" && (
              <label>
                {t.recovery}
                <input
                  name="recoveryCode"
                  type="password"
                  autoComplete="off"
                  minLength={32}
                  maxLength={128}
                  required
                />
              </label>
            )}
            <Button type="submit" disabled={busy || checking || !local.ready}>
              {t.submit}
            </Button>
          </form>
        </>
      ) : (
        <>
          <p>
            {t.signed} <strong>{username}</strong>
          </p>
          {recovery && (
            <div className="notice account-recovery" role="status">
              <h2>{t.recovery}</h2>
              <p>{t.once}</p>
              <code>{recovery}</code>
              <Button onClick={() => setRecovery("")}>{t.saved}</Button>
            </div>
          )}
          <div className="actions">
            <Button
              disabled={busy || !local.plan || !local.ready}
              onClick={() => void run(synchronize)}
            >
              {t.sync}
            </Button>
            <Button disabled={busy} onClick={() => void run(refresh)}>
              {t.refresh}
            </Button>
            <Button disabled={busy} onClick={() => void run(exportAccount)}>
              {t.exported}
            </Button>
            <Button disabled={busy} onClick={() => void run(signout)}>
              {t.logout}
            </Button>
          </div>
          <h2>{t.cloud}</h2>
          {!cloud.length && <p>{t.empty}</p>}
          <ul className="account-plans">
            {cloud.map((plan) => (
              <li key={plan.id}>
                <h3>{String(plan.snapshot.name)}</h3>
                <p>
                  {t.revision} {plan.revision}
                  {plan.conflictOf ? ` · ${t.conflictLabel}` : ""}
                </p>
                <Button
                  disabled={busy || local.busy}
                  onClick={() =>
                    void run(async () => {
                      const snapshot = parsePlan(
                        JSON.stringify({
                          ...plan.snapshot,
                          id: crypto.randomUUID(),
                        }),
                      );
                      if (!(await local.save(snapshot)))
                        throw new Error("Local save failed");
                      remember(username, snapshot.id, plan);
                      setNotice("copied");
                    })
                  }
                >
                  {t.download}
                </Button>
              </li>
            ))}
          </ul>
          {!deleting ? (
            <Button disabled={busy} onClick={() => setDeleting(true)}>
              {t.remove}
            </Button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const password = String(new FormData(form).get("password"));
                void run(async () => {
                  const result = await client().DELETE("/api/v1/account", {
                    body: { password },
                  });
                  if (!result.response.ok)
                    throw new Failure(result.response.status);
                  form.reset();
                  setUsername(null);
                  setCloud([]);
                  setRecovery("");
                  setDeleting(false);
                  try {
                    sessionStorage.removeItem(`unifr.sync.${username}`);
                  } catch {
                    /* Optional metadata. */
                  }
                });
              }}
            >
              <p>{t.deleteHint}</p>
              <label>
                {t.password}
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <Button type="submit" disabled={busy}>
                {t.confirm}
              </Button>
              <Button disabled={busy} onClick={() => setDeleting(false)}>
                {t.cancel}
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
