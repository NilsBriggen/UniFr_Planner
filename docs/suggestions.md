# Explainable suggestions

Open **Suggestions** from the degree plan. The current live catalogue is unavailable: the interface explicitly offers a separate fictional example, with codes prefixed `DEMO-`, rather than treating a real plan as having no alternatives. Example plans are created only by the student's button action, with new identifiers. Other plans show **no candidate data**. A known candidate set blocked by pins or prerequisites shows **no safe suggestion**, with exclusion reasons.

## Pure engine contract

`apps/web/src/suggestions/engine.ts` accepts a parsed plan, source-backed catalogue candidates, a requirements result, and explicit preferences. It performs no IO, reads no clock, and never changes its inputs. The requirements tree is reevaluated against the active scenario and its existing evidence rather than trusting potentially stale totals. Candidate records explicitly distinguish a source-confirmed empty prerequisite list from unknown prerequisites (`null`); unknown prerequisites exclude the candidate. Equivalent codes and source evidence must be supplied by the caller. Eligible elective replacements must share an eligible credit/count pool in the evaluated requirements.

Each candidate replaces exactly one non-completed selection. Its identity is retained, while the proposed code, offering, ECTS and semester are shown for comparison. Other scenarios, programme bindings, unavailable periods and personal evidence remain intact. Pins cannot move. Prerequisites must be self-reported completed in an earlier term (or completed with no term). The offering's declared terms must include a semester in the plan. No new dated hard overlap is allowed, even if an old overlap disappears; checks span semester boundaries. A course replacement cannot reinterpret an existing personal override for another course.

Selected `one_of` branches in the supplied requirements result are preserved when reevaluating both the baseline and candidates. Individual credit-maximum violations are compared even when the aggregate rule status already needs clarification. Conflicting catalogue records sharing a course/offering/term identity are excluded before ranking, independently of source order, with an explicit conflicting-evidence reason.

Affected requirements are named in the selected language and show before/after remaining ECTS, missing-course count, allocated credits and any excess above the credit maximum. These quantities explain both advancement and loss of coverage; generic uncertainty acknowledgment does not replace this comparison.

Calendars use Task 4 recurrence/date expansion. Unknown or unsupported meetings, missing in-term occurrences, and unknown credits remain explicit uncertainty. A proposed calendar containing unresolved data never earns a proven clash-repair score. Requirement regressions and source/override uncertainty are prominently shown before applying. Unknown times remain reviewable conditional alternatives, not certified clash-free schedules.

## Ranking

Candidates are compared lexicographically, in this strict order:

1. Number of existing dated hard conflicts demonstrably resolved.
2. Reduction in compulsory or explicitly prioritized leaf gaps (remaining ECTS plus missing course count).
3. Negative absolute distance between the whole plan's allocated ECTS (including completed courses) and its target.
4. Whether the offering matches any preferred teaching language.
5. Negative count of unavailable-period overlaps plus meeting occurrences on desired free days (ISO weekdays 1–7).
6. Negative total of gaps between same-day meetings in minutes plus configured travel-buffer minutes for each travel risk.

Higher scores win; no lower criterion can outweigh an earlier criterion. Equal tuples use a stable course/offering/term identifier, independent of catalogue order. Each comparison explains its position relative to the next candidate, including ties, and shows all six scores. The interface currently exposes language and free-day preferences; explicit high-priority node IDs are supported by the engine input. Preferences affect ranking only and do not mutate the plan.

## Apply and Undo

Opening or closing a comparison is read-only. Applying creates a revision holding the full before/after plans. An uncertainty acknowledgment is required when warnings exist. IndexedDB version 3 stores the changed plan and its latest suggestion revision in one transaction. Undo survives navigation and reload, restores the full previous plan and all scenarios, and removes that latest revision. It is a single-level Undo, not a complete edit history. Existing v1/v2 databases upgrade without clearing their saved plans.

Both apply and undo compare the current stored plan to the expected revision inside the write transaction. Stale comparisons, later edits and other-tab changes cannot be overwritten. An unavailable browser store or failed transaction leaves the prior saved plan intact and displays an error. The ordinary guest-plan save workflow remains unchanged.

## Verification and boundaries

Engine tests cover a real dated collision repair, all hard constraints, source-supported routes, unknown calendars, requirement loss and overrides, all ranking criteria and deterministic ties, exact state restoration, and stale guards. Storage tests cover atomic revision persistence, reload and concurrent-tab protection. Playwright exercises German, French and English at desktop/phone widths, keyboard comparison/apply, warning acknowledgment, reload/Undo, absence-of-data versus all-pinned states, and Axe WCAG checks.

No live source claims, official recognition decisions, accounts, synchronization or operations are introduced. Live ingestion will need an adapter supplying verified equivalence, prerequisite and offering evidence before this engine can suggest changes for real plans.
