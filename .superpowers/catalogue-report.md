# Compact Courses report

## Scope delivered

- Replaced the duplicate full study summary above search with a compact degree label and requirements link.
- Advanced filters now start closed on direct load, client navigation, and saved-plan hydration. URL-backed filters remain visible as removable chips; validation still opens the panel and focuses the invalid field.
- Condensed catalogue provenance to one line with explicit fixture/rejected/stale state and expandable source detail.
- Made the phone semester summary a collapsed bar showing term, known ECTS, unknown-credit count, and conflict count. Desktop opens the disclosure by default; selected courses and actions remain inside it.
- Changed course rows to one primary `Add to semester · [term]` action. Semester choice is in an optional disclosure. Planned/current courses expose `Remove from semester`, which deliberately changes them to unscheduled; pinned and completed courses remain protected.
- Course-detail links carry the complete list query and captured scroll position; the in-app back link restores that state.
- Removed no recommendation fallback changes: recommendation filtering still stays strict and the existing explicit “Show all courses” path remains.

## Tests and verification

- `NODE_OPTIONS=--no-experimental-webstorage npm test --workspace @unifr/web` — 33 files, 359 tests passed.
- `NODE_OPTIONS=--no-experimental-webstorage npm run typecheck --workspace @unifr/web` — passed.
- `NODE_OPTIONS=--no-experimental-webstorage npm run lint -- --quiet` — passed.
- `NODE_OPTIONS=--no-experimental-webstorage npm run build --workspace @unifr/web` — passed. Existing discovery static/dynamic import and large-chunk warnings remain; bundle boundaries are owned by the main task.
- `E2E_PORT=4189 NODE_OPTIONS=--no-experimental-webstorage npm run test:e2e --workspace @unifr/web -- e2e/planning-flow.spec.ts --project=desktop` — 2 passed.
- `E2E_PORT=4195 NODE_OPTIONS=--no-experimental-webstorage npm run test:e2e --workspace @unifr/web -- e2e/assisted-planning.spec.ts --project=phone` — 1 passed, including accessibility checks and an assertion that the first actual course begins above the 780 px usable boundary (844 px viewport minus 64 px bottom navigation).

## Interfaces and integration notes

- No exported TypeScript interfaces were added or changed.
- Added localized catalogue message keys `sourceState` and `sourceDetails` and planner keys `removeFromSemester` and `changeSemester` in DE/FR/EN.
- The main task can change shared semester-label controls without adapting this branch; this work continues to use raw term strings.
- Main-task bundle splitting may move catalogue search/detail later. This commit intentionally leaves the large component intact to avoid a risky concurrent refactor.
- `.venv` and `node_modules` are worktree-local untracked links/directories and are excluded from the commit.
