# Simpler planning experience — approved implementation plan

Date: 2026-09-22. Original implementation baseline: `fb9acbe`.
This records the approved work and its acceptance criteria. It does not authorize a
production release. Verification below distinguishes bounded checks from outstanding
integration acceptance.

Implementation is complete locally. See the [final verification report](../reports/2026-09-22-simplicity.md) for integrated results and inspected screenshots.

## Goal and boundaries

Make the ordinary student journey shorter: configure studies, find semester courses,
and use the timetable. Put optional administration and detailed editing behind clear
disclosures while preserving meaningful uncertainty and existing data.

Retain guest-first use, German/French/English, keyboard access, accounts, sharing,
exports, scenarios and existing deep links. Do not change academic rules, infer missing
curriculum evidence, use MyUnifr credentials or send outreach. Preserve existing schema-v1/v2 plan
JSON, IndexedDB version 3, account payload compatibility and independently versioned
catalogue/recipe data. No push or deployment is included in this plan.

## Implementation work

1. **Save safety.** Require an expected committed baseline for each local save and
   compare it atomically with persisted data. Distinguish conflict from storage failure.
   Retain the attempted edit and offer explicit latest-version or fresh-ID copy recovery.
   Notify other tabs only after a successful save/apply/undo, with focus refresh fallback.
   Serialize refresh/write operations and never let refresh silently rebase an already
   computed edit or discard pending recovery.
2. **Navigation and loading.** Use three main areas: Timetable, Courses and My studies.
   Move Settings into the header; retain requirements/completed-course destinations within
   studies. Existing saved plans open on their planning semester. Lazy-load major areas,
   provide useful loading/failure feedback, and preserve accessible current-page indicators,
   page titles, focus movement and mobile navigation clearance.
3. **Degree-first setup.** Use Studies → Review and start. Search programme names with a
   labelled native selection, optional faculty filter and automatic sole valid choices.
   Show genuine variant/structure choices when needed. Use reusable season/year controls;
   minors default to the major start unless explicitly independent. Preserve separate
   dates when editing existing studies. Show prohibitions and review gaps. Derive an
   editable plan name and bounded planning horizon; keep manual setup and optional settings.
   Save once, allow continuing students to skip past-credit entry, and retain course return
   destinations.
4. **Courses.** Put semester, search, recommendation mode and results first. Keep advanced
   filters closed unless opened or invalid. Retain URL filters, active chips, query edits,
   and list position through detail/back navigation. Show concise source status with
   expandable explanation; fixture, stale, rejected, unavailable and empty results remain
   distinguishable. Use a compact expandable phone semester summary with known/unknown
   credits, known conflicts and unresolved timings visible. Offer direct add-to-semester
   and removal-to-unscheduled actions, respecting pinned/completed courses. Keep alternate
   allocation and unscheduled entry accessible. Explain unavailable recommendations and
   offer an explicit all-courses view without loosening academic matching rules.
5. **Timetable.** Prioritize the weekly schedule, current-week navigation and concise known
   conflicts. Open today when within the selected semester; otherwise use its first known
   meeting or start. Persist validated view/date preferences per plan/scenario/semester in
   sessionStorage, outside plan payloads. Keep day/agenda views, semester changes, unknown
   timing warnings and exports. Collapse optional availability and download controls without
   removing their functionality.
6. **My studies.** Lead with progress and planning context. Keep useful requirement and
   completed-course routes, with other semesters and detailed course edits secondary.
   Consolidate scenario/backup/import tools behind a clear plan-tools disclosure. Preserve
   pinned records, personal evidence, copy/import safety and existing planning operations.
7. **Delivery and maintenance.** Extract lightweight shared helpers where they prevent
   heavy academic modules loading in the shell. Enforce a 200,000-byte gzip initial-JavaScript
   budget across entry/static-import chunks. Compress public catalogue and static responses;
   exclude private account routes. Test real compressed bytes and a captured public payload
   below 1,500,000 gzip bytes. Replace stale foundation/scraping documentation with current
   development and ingestion references.

## Acceptance checklist

Each journey must run through the rendered app on desktop and phone, with screenshots
inspected where layout matters. Tests must exercise meaningful failures, not just empty
or successful paths.

- Configure a representative degree plus minor, including independent starting dates,
  a prohibited combination, an unreviewed programme and manual fallback. Verify one final
  save and existing degree/evidence compatibility; record or skip past credits.
- Search and filter beyond the first result page, open a detail and return by both browser
  and in-app navigation. Verify query, position and selection. Add, remove, reschedule and
  add an unscheduled course; verify pinned/completed protection and unknown timing display.
- On a 390×844 phone viewport with optional panels closed, inspect whether actual course
  results are readily visible and bottom navigation does not obscure controls. Check all
  three languages, keyboard flow, accessible names and unexpected horizontal overflow.
- Open the current week, change week/day/agenda and semesters, switch scenario/plan, and
  revisit/reload. Verify presentation state is scoped correctly and does not change JSON
  exports. Retain useful empty/out-of-range behavior and unresolved schedule warnings.
- Reproduce two stale tabs adding different courses. Confirm the second save conflicts,
  the newer saved plan survives, separate-copy recovery preserves the attempted edit under
  a new ID, and normal notifications refresh the other tab. Inject storage failure and a
  refresh/write race; preserve committed state and pending recovery.
- Verify accounts, sharing, downloads, requirements and suggestions still work. Run unit,
  browser, backend/PostgreSQL, recipe, type, lint and formatting checks. Exercise the actual
  production image build and compressed responses. Independent review findings must be
  resolved and covered before final integration acceptance.

Implementation is complete locally. See the [final verification report](../reports/2026-09-22-simplicity.md) for integrated results and inspected screenshots.

## Verification recorded on 2026-09-22

Documentation/check worktree baseline: `bcb5de5`; subsequent main-worktree changes are
outside this record unless explicitly stated. This is local evidence, not a deployment.

| Check                                                                                  | Result                                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Full Python suite with disposable PostgreSQL 17.6                                      | 265 passed, zero skipped; one existing Starlette/AnyIO deprecation warning                                                           |
| Ruff lint (`apps/api packages scripts/test-response-compression.py`)                   | Passed                                                                                                                               |
| Ruff formatting                                                                        | 64 existing Python files already formatted; new compression script formatted and rechecked                                           |
| mypy                                                                                   | Passed, 31 source files                                                                                                              |
| `npm run recipes:check`                                                                | Passed: edition 2026-27.1, 147 programmes, 293 variants; zero fully reviewed programmes, 147 with documented gaps                    |
| `npm run recipes:test`                                                                 | Five passed                                                                                                                          |
| Actual local Caddy compression, production/Traefik/web configs                         | All passed; 13,770,161-byte public sample → 963,678 gzip bytes; decoded bytes identical; account-path negative controls uncompressed |
| Earlier bounded save-safety slice                                                      | 365 unit tests and four desktop/phone browser cases passed in its isolated worktree; integration must rerun affected journeys        |
| Final integrated web suite, build budget, production image build and visual acceptance | Completed; see the linked final verification report                                                                                  |
| Production publication                                                                 | Not requested or performed                                                                                                           |

The compression check used
`unifr-planner-caddy:fb9acbe53d87f862b638066c97186ecceb2c686d` with the current checkout's
configs and the main worktree's `.superpowers/discovery-sample.json`; the exact command
is in [development](../../development.md). The fixture is local evidence rather than a
tracked dependency or a claim about today's live catalogue size.
