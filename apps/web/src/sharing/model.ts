import { activeScenario, parsePlan, type Plan } from "../planner/domain";

export type ShareRecord = {
  planId: string;
  id?: string;
  ownerKey?: string;
  revision: number;
  savedHash: string;
  includePersonal: boolean;
};
export type SharedPlan = {
  id: string;
  revision: number;
  updatedAt: string;
  snapshot: Plan;
  canManage: boolean;
};
export class ShareError extends Error {
  constructor(readonly status: number) {
    super("Share request failed");
  }
}
export function shareSnapshot(plan: Plan, includePersonal: boolean): Plan {
  const scenario = structuredClone(activeScenario(plan));
  if (!includePersonal) scenario.unavailable = [];
  delete scenario.requirementEvidence;
  return { ...plan, scenarios: [scenario] };
}
export async function snapshotHash(plan: Plan) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(plan)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function newOwnerKey() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function shareRequest(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<SharedPlan | undefined> {
  const response = await fetch(`/api/v1/shares${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "X-Unifr-Share-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new ShareError(response.status);
  if (response.status === 204) return;
  const value = await response.json();
  return {
    ...value,
    snapshot: parsePlan(JSON.stringify(value.snapshot)),
  } as SharedPlan;
}
