# Simplicity implementation and verification

2026-09-22 · implementation baseline `fb9acbe` · final application changes `cc42778`.
This records local implementation and verification. No push or deployment was performed.

## Delivered

- Three main areas: **Timetable, Courses, My studies**, with Settings in the header and returning plans opening their timetable.
- Two-step degree setup with programme search, readable semester controls, inherited or independent minor dates, automatic plan defaults, manual fallback and optional catch-up.
- Course results before advanced filters, a compact phone semester summary, direct add/remove actions, and query/scroll restoration through both browser and in-app Back.
- Current-week timetable with scoped date/view preferences, collapsed exports and availability entry, visible uncertainty, and no presentation preferences in exported plan data.
- Study progress before configuration; editing, other semesters, scenarios and backup/import tools available on demand. File import is primary. Printing expands every course group and restores the original display afterward.
- Atomic local save comparison, recoverable stale-tab edits, explicit latest/copy recovery and cross-tab invalidation.
- Lazy routes, lightweight shared modules, an enforced initial JavaScript budget, public catalogue/static compression and updated development documentation.

Academic rules and recipe data were not changed. The compiler still reports 147 programmes / 293 variants, with zero fully reviewed programmes. Missing evidence remains explicit.

## Measured outcomes

| Measure                                              | Audit baseline                     | Implemented result                                                                   |
| ---------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| Initial JavaScript, gzip                             | About 290 KB                       | 109,198 bytes; 200,000-byte enforced limit                                           |
| Production-container cold browser script transfer    | —                                  | About 115 KB encoded; no page errors                                                 |
| Captured public discovery response                   | 13,770,161 bytes                   | 963,678 gzip bytes through each shipped Caddy configuration; identical decoded bytes |
| First real recommended course, 390×844               | About 2,514 px below page top      | About 709 px in DE/FR/EN, above the bottom navigation                                |
| Timetable grid, three selected real courses, 390×844 | About 793 px                       | About 661 px EN / 713 px DE and FR                                                   |
| Stale tabs editing the same plan                     | Last writer overwrote another edit | Conflict preserves both the newer saved plan and a recoverable attempted edit        |

The payload and visual measurements used the public catalogue captured during this audit, with a Computer Science + Business Informatics plan. They are local measurements of the implementation, not claims that production has been updated. The cold-browser transfer uses the server's compression settings; the build budget uses Node gzip and is a separate metric.

## Verification

| Gate                                                   | Result                                                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Frontend/domain unit suite                             | 381 passed, 38 files                                                                                                         |
| Complete desktop browser suite                         | 71 passed; 1 deployed-admin check intentionally skipped                                                                      |
| Complete Pixel 7 browser suite                         | 71 passed; 1 deployed-admin check intentionally skipped                                                                      |
| Full backend suite with disposable PostgreSQL 17.6     | 265 passed, zero skipped                                                                                                     |
| Recipe compilation / compiler tests                    | 147 programmes, 293 variants / 5 tests passed                                                                                |
| TypeScript, ESLint, Prettier                           | Passed                                                                                                                       |
| Ruff / mypy                                            | Passed / 31 source files                                                                                                     |
| Root production build and web Docker production target | Passed, including build-budget script inside the image build                                                                 |
| Budget negative control                                | A 1-byte limit rejects the same build                                                                                        |
| Caddy production/Traefik/static compression            | All three passed; public decode identity and private-account exclusion verified                                              |
| Shipped Traefik trust boundary                         | Trusted peer and forged-prefix checks passed; untrusted peers refused                                                        |
| Visual layout matrix                                   | Setup, Courses, My studies, requirements and timetable; DE/FR/EN; widths 320/390/768/1440; no page-level horizontal overflow |
| Whole-plan print regression                            | Real Chromium PDF includes active/future/past/completed/unscheduled records; prior open/closed state restored                |
| Independent review                                     | Storage/recovery, setup, catalogue, calendar, studies and print reviewed; reported regressions corrected                     |

Browser flows exercise real local APIs, IndexedDB, account/sharing round trips, course allocation, keyboard rescheduling, exports, requirements and overrides, source rejection, unavailable data, history, and storage failures. Calendar fixtures now fix browser dates so current-week behavior stays reproducible. The unchanged logo checksum and accessible shell checks pass. The two skipped tests need a deployed administrator credential; production operations and release rollout were not exercised.

## Inspected phone views

[Courses](2026-09-22-simplicity/catalogue-en-390.png) · [Timetable](2026-09-22-simplicity/timetable-en-390.png) · [My studies](2026-09-22-simplicity/plan-en-390.png) · [Setup](2026-09-22-simplicity/setup-en-390.png)

The implementation plan and acceptance criteria are in [the approved plan](../plans/2026-09-22-simplicity.md). Repeatable commands are in [development](../../development.md).
