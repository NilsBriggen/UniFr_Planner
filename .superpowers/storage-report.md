# Storage safety implementation report

## Changes

- `PlanStore.save(next, expectedPrevious)` now requires an explicit baseline (null means the ID must be absent). It reads, compares, writes plan and selects active ID within one IndexedDB readwrite transaction. A distinct exported `PlanConflictError` differentiates stale state from storage errors. No schema/version change.
- Comparisons normalize persisted legacy plans using the existing migration/parser. Unreadable records cannot be overwritten by claiming an absent baseline. Suggestion apply/undo retain their compare guard and now report the same distinct conflict error.
- Provider saves retain the render's committed baseline; an asynchronous refresh cannot substitute a fresh baseline for an already-computed edit. Refresh/save/select serialize through the existing lock, with queued refreshes drained after a write. StrictMode startup/remount is covered.
- Rejected ordinary/revision writes preserve the attempted plan as `conflict`. Automatic refresh updates committed data but never clears pending recovery. Explicit load-latest clears recovery only after successful load; save-copy uses a new UUID and an absent-record guard. Storage failures do not update committed state.
- Successful save/apply/undo emits a BroadcastChannel invalidation (no plan/draft payload); other tabs reload committed data. Focus reload also works if channels are unavailable. Local plan selection is preserved on automatic refresh.
- New default/named `PlanConflictNotice` takes `{language}`, with German/French/English recovery copy and two actions. The main agent must wire this in the app shell. App.tsx and Planner.tsx are unchanged in this commit.
- Existing direct storage test fixtures explicitly supply null for creates or their prior version for updates; one account test now waits for local store readiness before asserting copy is enabled.

## Verification

Final commands on host Node 26, with `NODE_OPTIONS=--no-experimental-webstorage`:

- `npm run test --workspace @unifr/web`: **34 files / 365 tests passed**.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- `E2E_PORT=4197 npm run test:e2e -- save-safety.spec.ts`: **4 passed** (desktop + phone). Local isolated fixture APIs used ports 8091/8092. For this run only, App.tsx temporarily rendered PlanConflictNotice beside SourceChanges; both this wiring and temporary Playwright port changes were reverted before final tests/commit.
- Actual two-page browser sequence: create plan; both tabs read it; suppress notifications to simulate a suspended/missed-update tab; A adds DEMO-001; stale B tries DEMO-002; verify A persists and B shows conflict; B saves separate copy; verify two unique IDs with the two respective course lists, surviving reload. Separate normal-channel journey verifies the other tab's rendered course appears after save.
- Screenshot inspection of `apps/web/test-results/save-safety-two-stale-tabs-25a85-ough-separate-plan-recovery-phone/plan-conflict.png` caught and fixed cramped horizontal notice layout. Final phone notice has readable paragraph and stacked buttons. Screenshots are local ignored test artifacts, not committed.
- Positive-control mutation: temporarily removed ordinary save comparison; `storage.test.ts` failed its concurrent-create assertion (two saves succeeded instead of one). Restored guard before final full checks.
- New context tests cover stale save, fresh-ID copy, explicit latest recovery, automatic refresh preserving attempted recovery, storage failure without state change, in-flight write vs focus refresh, BroadcastChannel refresh and notification counts, and StrictMode readiness.

## Integration and limits

- Wire the new component globally before running the new e2e recovery test. E2E seeding uses `/setup` and existing manual setup helper.
- Schema version 1, IndexedDB version 3, JSON export/account payload shape remain unchanged. No API or academic-rule changes. No production writes, pushes, or deployments.
- Provider still imports `applySuggestion` from the heavy suggestion engine. Main agent owns bundle extraction; the function depends only on activeScenario/updateScenario/structuredClone and its types.
- Recovery is intentionally in-memory until the user explicitly saves a copy. Closing/reloading a tab while its attempted edit remains unsaved loses that attempt; existing committed versions remain safe.
- A copied plan retains its original display name but receives a fresh ID. Both versions remain selectable.
