# Programme research and requirements boundary

Research date: **2026-09-18**. This is a planning aid with self-reported course
completion, not a transcript validator. All published programme roots currently
have `needs_clarification`. Individual CS course-table and 2025/2026 library-duty
rules have been checked against the cited official documents. No complete degree
pack has been certified as verified.

## Official source register

The approved source set was used, together with the year-specific documents and
faculty study-plan links it identifies. Retrieval used the web reader. Source
URLs, titles, document revision dates (or explicit null), sections/pages, proposed
cohorts and retrieval dates are also stored with every executable rule.

| Source                                                                                                                   | Revision / retrieval                                       | Evidence and boundary                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Science and Medicine Bachelor index](https://www.unifr.ch/scimed/en/plans/bachelor)                                     | Undated; retrieved 2026-09-18                              | Annual 2024, 2025, 2026 sections identify their CS documents. Annual placement does not resolve transition applicability for an individual student.                                     |
| [CS 2024 curriculum](https://cdn.unifr.ch/scimed/plans/2024/Plan_BSc_IN_fr.pdf)                                          | Revised 2024-04-15; state 2024-06-14; retrieved 2026-09-18 | 10 pages. Course tables pp. 6, 8, 9; validation pp. 7, 10; ethics p. 5.                                                                                                                 |
| [CS 2025 curriculum](https://cdn.unifr.ch/scimed/plans/2025/Plan_BSc_IN_fr.pdf)                                          | Revised 2025-04-14; state 2025-08-07; retrieved 2026-09-18 | Same coded course rows as 2024; additional required library training and integrity declaration §1.6.                                                                                    |
| [Current CS curriculum, retrieved for 2026](https://cdn.unifr.ch/scimed/plans/current/Plan_BSc_IN_fr.pdf)                | Revised 2026-04-13; state 2026-05-19; retrieved 2026-09-18 | `SIN.06023` replaces the printed `SIN.06022` row. No automatic equivalence or retrospective cohort migration is inferred. The URL is mutable; encoded values remain pinned in `2026.1`. |
| [Department BI summary](https://www.unifr.ch/inf/en/bsc-minor-business-informatics.html)                                 | No publication/revision date; retrieved 2026-09-18         | General 60/30, CS-major 60/33 and management-combination 30 variants. Course titles and credits are supplied, not stable course codes or cohort transitions.                            |
| [SES minor index](https://www.unifr.ch/ses/en/studies/minors.html)                                                       | Undated; retrieved 2026-09-18                              | General 60/30 and CS-major smaller 30 headings. The full-plan link initially returned an internal retrieval error.                                                                      |
| [SES full-plan landing page](https://www.unifr.ch/ses/en/studies/minors/plans-d%E2%80%99%C3%A9tudes-bc-bachelor.html)    | Undated; retrieved through official-site search 2026-09-18 | Recovered the official landing page after link failure. Actual BI documents are hosted in Calaméo readers; each returned cache-miss retrieval errors. Their contents were not used.     |
| [University faculty structures](https://www.unifr.ch/studies/en/organisation/beginning-of-studies/structure-of-studies/) | Undated; retrieved 2026-09-18                              | Overview for the backlog below, not programme-level validation.                                                                                                                         |

The failed faculty-linked reader URLs are
[30 ECTS](https://www.calameo.com/read/0036591152d4e57d4f8e9),
[60 ECTS entry 1](https://www.calameo.com/read/003659115bf1eab2de904) and
[60 ECTS entry 2](https://www.calameo.com/read/00365911589be13db1ca5).
The two 60 headings alone do not identify which document applies to which
variant. Shell retrieval also failed: restricted DNS first, then no usable body
from the approved outside-sandbox request. No status, date or curriculum content
was inferred from these failed requests.

The timetable is not degree-rule authority and was not used to invent missing
codes. Faculty regulations, assessment annexes, propaedeutic mathematics details,
and transition annexes are separate outstanding review items; the CS curriculum
references them but does not provide all their rules. The source register does
not imply that those referenced documents were retrieved or reviewed. No raw PDF
or HTML archive or source-content hash is shipped; future review should archive
the official bytes when retrieval permits.

## Encoded packs and unresolved questions

Each of 2024, 2025 and 2026 has six immutable revision entries:

| Code      | Nominal ECTS | Encoded source structure                                                                                            |
| --------- | -----------: | ------------------------------------------------------------------------------------------------------------------- |
| CS-120    |          120 | 19 coded compulsory course/project rows, 12-ECTS mathematics pool without invented codes; 2025/2026 library duties. |
| BI-60     |           60 | Seven compulsory 6-ECTS courses, 18-ECTS elective pool.                                                             |
| BI-30     |           30 | Five compulsory 6-ECTS courses.                                                                                     |
| BI-CS-60  |           60 | Four compulsory 6-ECTS courses plus two 4.5-ECTS courses, 27-ECTS elective pool.                                    |
| BI-CS-33  |           33 | Same 33 compulsory ECTS; explicitly disputed against the SES smaller-30 heading.                                    |
| BI-MAN-30 |           30 | Five compulsory 6-ECTS courses for the management-minor combination.                                                |

The CS documents all announce 120 ECTS for the major but state validation
packages of 44 and 79 ECTS. Their rows total 123 including propaedeutic
mathematics. The engine preserves the course values, displays the conflict and
never silently subtracts 3 ECTS. The general Bachelor structure in §2/§2.3 is
120 plus either 60 or 30+30 complementary ECTS. This structural choice is tested
in the generic engine; selecting packs in the UI does not establish permission
for their combination. There are no verified arbitrary second-minor packs yet.

BI revisions for the three requested cohorts are **research candidates**, not
proof that the undated summary applied in that year. All BI rules are
`needs_clarification`. The source supplies a programming substitution exception
for students with CS as a supplementary discipline; the generic BI-60 root is
therefore not universally applicable. Its citation records this exception.

Unmapped BI course codes and elective eligible-code sets are empty intentionally.
There is no automatic title match, wildcard pool or guessed EIG/SES code. The
student can record a clearly labelled personal substitution with a reason; it
does not upgrade source review status or establish faculty approval.

For the next faculty-document review, the department's general elective list
includes security, Decision Support I/II, machine learning, development project,
requirements engineering, algorithmics, object-oriented programming, software
engineering, controlling, strategic management, organisation, financial
accounting and investment/financing. The CS-major elective list excludes the
CS overlap and instead includes marketing and human resources alongside the
listed management/decision-support options. Two investment/financing labels
occur in the CS list; no distinct-course or equivalence inference is made. Exact
eligible course IDs, credits and duplicates must be reconciled with the faculty
document before this set becomes automatically allocatable.

## Domain and persistence contract

The pure TypeScript engine lives in `packages/domain/src/requirements.ts` and is
imported directly by the browser adapter. It uses no clock, network, IO, React or
storage. The existing Python package remains available for backend domain work.
`npm test` includes the domain tests through the web Vitest configuration.

Every node is a discriminated union: `all_of`, `one_of`, `course`, `credit_pool`,
`course_count`, `project`, or `checklist`. Results retain the rule, citations,
allocations, selected alternative, source explanation, earned/current/planned
credits, remaining credits and remaining course count. `remaining` is not yet
covered by completed/current/planned work; `remainingToEarn` excludes only
completed work. Unscheduled courses never contribute. Unknown credits and
excesses over explicit bounds produce clarification rather than completion.

Allocation is deterministic: explicit user allocations take priority, then
completed before current before planned and code order break equivalent choices.
Whole courses are allocated once across the selected tree unless a rule permits
reuse; even then ancestor credit totals deduplicate them. Alternative branches
are evaluated independently and only one branch contributes. When automatic
course eligibility overlaps between sibling leaves or pools, the engine resolves
their ownership together rather than letting presentation order consume a course
needed by a narrower rule. Records with identical eligibility, status and credit
evidence are grouped so common symmetric pools remain small. To avoid freezing
the browser on an unusually ambiguous custom pack, exact allocation is accepted
only when its deterministic preflight is at most 4,096 distributions and 250,000
estimated node/candidate visits; larger searches fail visibly with
`requirement allocation search limit exceeded` and never return a partial result.
Personal allocations can disambiguate such a pack. This is still evaluation, not
a recommendations engine.

Published templates are recursively frozen copies. Exact `(code, version,
cohort)` resolution is required; no latest-version fallback exists. Corrections
must add a new revision and an explicit migration flow before existing bindings
change. There is no migration UI in this release because no replacement revision
has been published.

Task 4 schema-version-1 plans gain optional `requirements` (cohort and up to three
exact template references) and per-scenario `requirementEvidence` (overrides and
completed duties). Old plans parse unchanged and acquire no requirements until
the user selects a pack. Scenario duplication, IndexedDB, JSON export/import and
existing validation all retain these fields. Unknown revisions fail visibly;
stale override targets are not silently dropped. Degree-plan export remains
available for recovery. Native lists, labels, details/summary and form controls
provide accessible hierarchy and keyboard interaction without a partially
implemented ARIA tree widget.

For a single course/project requirement, explicit evidence replaces automatic
matching altogether. Multiple records count together only when each is an
explicit personal allocation/substitution to that requirement; ordinary
equivalent attempts are never combined. Automatic matching prefers an eligible
record that satisfies the credit bounds before an insufficient equivalent, and
uses the same choice for compulsory-course reservation. Pool overrides are
allocated first, with automatic eligible records filling only the unmet demand.
Remaining-credit aggregation shares obligations only where a requirement
explicitly permits reuse and the evidence identity or future eligible codes
overlap. A separate parent's own minimum-credit floor is still enforced. Imported
stale checklist evidence can be cleared even when no overrides were recorded.

## Cross-faculty expansion backlog

This is a **backlog**, not a list of verified programmes. The order follows
dependencies on the initial CS/BI students and reusable requirements models.

| Order | Faculty                                   | Overview to investigate                                                                                   |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1     | Science and Medicine                      | Finish CS annexes/mathematics/transitions, then 120/150 majors plus minors and 180 exceptions.            |
| 2     | Management, Economics and Social Sciences | Reconcile BI official revisions and codes, then 180 majors, 120+60 and 90+60+30 exceptions, 60/30 minors. |
| 3     | Humanities                                | 120+60 Bachelor and named 180 exceptions; 90-ECTS Master plus 30 components.                              |
| 4     | Education                                 | Bachelor 180 or 120+60; Master variants 60/90/106/120; minors.                                            |
| 5     | Theology                                  | Bachelor 180 or 120+(60 or 30+30); Master 120 or 90+30; minors.                                           |
| 6     | Law                                       | Bachelor 180 with optional additional programmes; 60/30 minors; Master 90.                                |

Each future pack requires a separate regulation, curriculum, assessment,
transition and student-history review before its status can become verified.
