import { useCallback, useEffect, useRef, useState } from "react";
import createClient from "openapi-fetch";
import type { components, paths } from "../api/schema";
import type { Language } from "../i18n";
import { Button } from "../components";
import { usePlans } from "../planner/context";
import { parsePlan } from "../planner/domain";
import { accountMessages } from "./messages";
import "./accounts.css";

type Cloud = components["schemas"]["SavedPlan"];
type Identity = components["schemas"]["Identity"];
type Link = { id: string; revision: number };
const client = (owner?: string) =>
  createClient<paths>({
    baseUrl: window.location.origin,
    fetch: (request) => fetch(request),
    headers: owner ? { "X-Unifr-Account": owner } : undefined,
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
  const [identity, setIdentity] = useState<Identity | null>(null);
  const identityRef = useRef<Identity | null>(null);
  const username = identity?.username ?? null;
  const [cloud, setCloud] = useState<Cloud[]>([]);
  const [unreadableIds, setUnreadableIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [recovery, setRecovery] = useState("");
  const [notice, setNotice] = useState<
    | "error"
    | "limited"
    | "done"
    | "conflict"
    | "copied"
    | "importing"
    | "identityChanged"
    | null
  >(null);
  const [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(true);
  const lock = useRef(false);
  const applyIdentity = useCallback((next: Identity | null) => {
    if (identityRef.current?.accountId !== next?.accountId) {
      setCloud([]);
      setUnreadableIds([]);
      setRecovery("");
      setDeleting(false);
    }
    // A registration response also contains the one-time recovery code. Keep
    // only public identity fields here so acknowledgement clears the secret.
    const current = next
      ? { accountId: next.accountId, username: next.username }
      : null;
    identityRef.current = current;
    setIdentity(current);
  }, []);
  const loadPlans = useCallback(async (owner: string) => {
    const result = required(await client(owner).GET("/api/v1/account/plans"));
    const valid: Cloud[] = [],
      unreadable = [...(result.unreadableIds ?? [])];
    for (const plan of result.plans) {
      try {
        parsePlan(JSON.stringify(plan.snapshot));
        valid.push(plan);
      } catch {
        unreadable.push(plan.id);
      }
    }
    if (identityRef.current?.accountId === owner) {
      setCloud(valid);
      setUnreadableIds([...new Set(unreadable)]);
    }
  }, []);
  const revalidate = useCallback(
    async (expected: string | null) => {
      const result = await client().GET("/api/v1/account/session");
      const next = result.response.status === 401 ? null : required(result);
      if (next && !next.accountId) throw new Failure(401);
      const changed = (next?.accountId ?? null) !== expected;
      applyIdentity(next);
      if (changed) {
        setNotice("identityChanged");
        if (next) await loadPlans(next.accountId);
      }
      return !changed;
    },
    [applyIdentity, loadPlans],
  );
  useEffect(() => {
    let active = true;
    void client()
      .GET("/api/v1/account/session")
      .then(async (result) => {
        if (!active) return;
        if (result.data) {
          applyIdentity(result.data);
          await loadPlans(result.data.accountId);
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
  }, [applyIdentity, loadPlans]);
  useEffect(() => {
    const check = () => {
      if (lock.current || document.visibilityState === "hidden") return;
      lock.current = true;
      setChecking(true);
      void revalidate(identityRef.current?.accountId ?? null)
        .catch(() => setNotice("error"))
        .finally(() => {
          lock.current = false;
          setChecking(false);
        });
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [revalidate]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      if (!(await revalidate(identity?.accountId ?? null))) return;
      await action();
    } catch (error) {
      if (
        error instanceof Failure &&
        (error.status === 409 || error.status === 401)
      ) {
        try {
          if (!(await revalidate(identity?.accountId ?? null))) return;
        } catch {
          /* Keep the action failed if identity cannot be checked. */
        }
      }
      setNotice(
        error instanceof Failure && error.status === 429 ? "limited" : "error",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    if (identity) await loadPlans(identity.accountId);
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
    applyIdentity(result);
    setRecovery("recoveryCode" in result ? String(result.recoveryCode) : "");
    setCloud([]);
    try {
      if (local.plans.length) {
        const copies = required(
          await client(result.accountId).POST("/api/v1/account/plans/import", {
            body: { plans: local.plans },
          }),
        );
        copies.plans.forEach((plan, index) =>
          remember(result.username, local.plans[index].id, plan),
        );
      }
      await loadPlans(result.accountId);
      setNotice("done");
    } catch {
      if (await revalidate(result.accountId)) setNotice("importing");
    }
  }
  async function synchronize() {
    if (!identity || !username || !local.plan) return;
    const link = linksFor(username)[local.plan.id];
    if (!link) {
      const result = required(
        await client(identity.accountId).POST("/api/v1/account/plans/import", {
          body: { plans: [local.plan] },
        }),
      );
      remember(username, local.plan.id, result.plans[0]);
      setNotice("done");
    } else {
      const result = await client(identity.accountId).PUT(
        "/api/v1/account/plans/{identifier}",
        {
          params: { path: { identifier: link.id } },
          body: {
            revision: link.revision,
            snapshot: { ...local.plan, id: link.id },
          },
        },
      );
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
    const result = await client(identity?.accountId).POST(
      "/api/v1/account/logout",
    );
    if (!result.response.ok) throw new Failure(result.response.status);
    applyIdentity(null);
    setCloud([]);
    setRecovery("");
    setDeleting(false);
  }
  async function exportAccount() {
    const archive = required(
      await client(identity?.accountId).GET("/api/v1/account/export"),
    );
    if (archive.schemaVersion !== 1) throw new Error("Invalid archive");
    archive.plans.forEach((p) => parsePlan(JSON.stringify(p.snapshot)));
    downloadJson(archive, "unifr-account-v1.json");
  }
  function downloadJson(value: unknown, filename: string) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
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
            notice === "error" ||
            notice === "limited" ||
            notice === "importing" ||
            notice === "identityChanged"
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
              <Button
                disabled={busy || checking}
                onClick={() => void run(async () => setRecovery(""))}
              >
                {t.saved}
              </Button>
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
          {unreadableIds.length > 0 && (
            <div role="alert" className="notice account-recovery">
              <p>{t.unreadable}</p>
              <ul>
                {unreadableIds.map((id) => (
                  <li key={id}>
                    <code>{id}</code>{" "}
                    <Button
                      disabled={busy || checking}
                      onClick={() =>
                        void run(async () => {
                          const data = required(
                            await client(identity?.accountId).GET(
                              "/api/v1/account/plans/{identifier}/recovery",
                              { params: { path: { identifier: id } } },
                            ),
                          );
                          downloadJson(data, "unifr-plan-recovery-v1.json");
                        })
                      }
                    >
                      {t.recoverData}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
            <Button
              disabled={busy || checking}
              onClick={() => void run(async () => setDeleting(true))}
            >
              {t.remove}
            </Button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const password = String(new FormData(form).get("password"));
                void run(async () => {
                  const result = await client(identity?.accountId).DELETE(
                    "/api/v1/account",
                    {
                      body: { password },
                    },
                  );
                  if (!result.response.ok)
                    throw new Failure(result.response.status);
                  form.reset();
                  applyIdentity(null);
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
