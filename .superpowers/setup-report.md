# Setup simplicity report

## Changes

- Extracted `Setup` to `apps/web/src/planner/Setup.tsx`; `Planner.tsx` retains the public re-export. `PlanBoard`, `SaveStatus`, and `Download` implementations are unchanged.
- Reduced new-plan setup to **Studies** and **Review and start**. The setup chooser composes the degree and advances in one action; the existing requirements editor retains its separate preview/save workflow.
- Added localized programme-name search with an optional faculty filter. Single major variants and single structures are selected automatically and rendered as summaries; genuinely multiple structures remain explicit choices.
- Added `SemesterField` and `semesterLabel`. The component keeps canonical `AS-YYYY` / `SS-YYYY` values while exposing native season and numeric year controls.
- Replaced raw semester-code inputs in `DegreeSelectionForm`. Additional components inherit the major start by default; checking the localized “different semester” control preserves and exposes the component's independent date.
- The review screen shows the degree, counted ECTS, source-review caveats, and localized planning semester. It derives the default horizon as `ceil(targetEcts / 30)`, still bounds it to 1–24, and extends it during persistence when needed to include the planning semester.
- Plan name and horizon live under optional settings. The manual fallback retains editable personal programme/ECTS values; “Set this up later” remains available. Existing `returnTo` and continuing-student catch-up routing are retained.
- Added DE/FR/EN copy and setup/semester layout styles. Updated affected tests to use the new semantic controls and flow.

## Accessibility and integration contract

- Locate semester controls by `${label} · ${localized season label}` and `${label} · ${localized year label}`. English examples are `Planning semester · Season` and `Planning semester · Year`; the enclosing fieldset is named `Planning semester`.
- `SemesterField` props are exactly `label`, `value`, `onChange`, `language`, and optional `disabled`.
- `semesterLabel(term, language)` returns localized `Autumn/Spring YYYY` equivalents.
- `DegreeSelectionForm` defaults to the existing editor contract. Only callers passing `setupMode` receive direct composition/commit and compact single-choice summaries.
- `Planner.tsx` continues to export `Setup`, so existing imports do not need to change.

## Verification

- TDD red evidence: the new semester-field suite initially failed because `./SemesterField` did not exist; the new setup-flow test initially failed because `Search programmes` did not exist.
- `NODE_OPTIONS=--no-experimental-webstorage npm test --workspace @unifr/web` — 34 files, 361 tests passed.
- `NODE_OPTIONS=--no-experimental-webstorage npm run typecheck` — passed.
- `npm run format:check` — passed.
- `npm run lint` — passed after the final targeted lint run recorded with the commit verification.

The full Playwright/browser suite is intentionally left to the main integration agent per the setup brief.
