# UniFr Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted, multilingual UniFr course planner that imports the current timetable every morning, detects real scheduling conflicts, and tracks degree requirements and ECTS across an entire study programme.

**Architecture:** A React web client talks to a FastAPI application backed by PostgreSQL. A scheduled ingestion worker builds validated, versioned catalogue snapshots from the public UniFr timetable, while a deterministic requirements and suggestion engine evaluates saved plans without silently changing student choices.

**Tech Stack:** React, TypeScript, Vite, FastAPI, Python, SQLAlchemy, Alembic, PostgreSQL, Playwright, Pytest, Vitest, Docker Compose, Caddy.

## Global Constraints

- The application interface is available in German, French, and English.
- The first verified programme templates cover Computer Science with Business Informatics for students entering from 2024 through 2026.
- The catalogue sync runs daily at 05:00 in `Europe/Zurich` and never replaces the last valid snapshot with an incomplete import.
- Guest planning works without an account; optional accounts synchronize plans without requiring an outgoing email service.
- The interface uses the checked-in UniFr logo and follows the visual language currently used by UniFr.
- Unknown or unpublished meeting times are visibly unresolved and are never treated as conflict-free.
- Sourced requirements, personal overrides, and unresolved interpretations remain visibly distinct.
- The planner never claims that a plan is an official graduation decision.
- MyUnifr credentials, course registration, grade-average calculations, and examination-attempt tracking are outside the first release.

---

## 1. Product behaviour

The product combines two synchronized views of the same plan:

1. **Degree view:** semester columns for the whole Bachelor, with completed, current, planned, and unscheduled courses; ECTS progress; prerequisites; and remaining requirements.
2. **Weekly view:** a date-aware timetable for one semester, including lectures, exercises, block courses, rooms, personal unavailable periods, and conflicts that occur only on specific dates.

The primary workflow is:

1. Choose degree, major/minor configuration, entry year, interface language, preferred teaching languages, and target ECTS per semester.
2. Import or manually mark completed and recognized courses.
3. Add required or elective courses to semester columns.
4. Open the selected semester to see its actual weekly schedule.
5. Pin courses the student wants to keep and request alternatives for clashes or requirement gaps.
6. Compare an alternative before applying it, with an explanation of the timetable and requirement changes.
7. Export the final semester to ICS or print/PDF.

Every progress display separates:

- **Earned:** passed or formally recognized credits.
- **In progress:** courses currently being taken.
- **Planned:** future selected courses.
- **Remaining:** requirements not yet covered.

Students can create named scenarios such as “compact week,” “German courses,” or “30 ECTS,” duplicate a scenario, and switch between them without overwriting the base plan.

## 2. First-release study coverage

The requirements engine must be generic, but only reviewed programme packs are labelled as verified.

The first reviewed packs are:

- Bachelor of Science in Computer Science, 120 ECTS major.
- Business Informatics complementary programme for Computer Science majors, including the applicable 60-ECTS and smaller variants.
- Cohort versions and transition provisions applicable to students entering in 2024, 2025, or 2026.

The research process for each pack is:

1. Record the faculty regulation, curriculum, assessment annex, transition provisions, and department summary as separate source documents.
2. Extract compulsory courses, credit pools, validation groups, prerequisites, projects/thesis, and non-credit duties.
3. Map rules to stable UniFr course codes rather than course titles.
4. Record source URL, document title, publication/revision date, page or section, applicable cohort, and retrieval date for every rule.
5. Reconcile department summaries with faculty documents. When they disagree, publish the requirement as “needs clarification” instead of choosing silently.
6. Test the pack against realistic student histories before changing its status to “verified.”

The initial faculty inventory also records the broad degree structures offered by Theology, Law, Management/Economics/Social Sciences, Humanities, Education, and Science/Medicine. It serves as the expansion backlog; it does not imply that every programme is verified at launch.

Use these official sources as the initial research set:

- UniFr timetable: https://www.unifr.ch/timetable/en/
- University-wide faculty structures: https://www.unifr.ch/studies/en/organisation/beginning-of-studies/structure-of-studies/
- Science and Medicine Bachelor curricula by year: https://www.unifr.ch/scimed/en/plans/bachelor
- Current Computer Science curriculum: https://cdn.unifr.ch/scimed/plans/current/Plan_BSc_IN_fr.pdf
- Department summary for the Business Informatics minor: https://www.unifr.ch/inf/en/bsc-minor-business-informatics.html
- SES Bachelor minor study plans: https://www.unifr.ch/ses/en/studies/minors.html

## 3. Requirements model

Use a versioned tree so faculty-specific rules do not require custom application code.

`ProgrammeTemplate` contains programme code, degree level, faculty, total ECTS, version, effective cohort range, source documents, review status, and a root requirement.

`RequirementNode` supports these kinds:

- `all_of`: every child must be satisfied.
- `one_of`: choose one alternative branch.
- `course`: a specific course or approved equivalent.
- `credit_pool`: earn at least a specified number of ECTS from an eligible set.
- `course_count`: complete at least a specified number of courses from a set.
- `project`: thesis, project, seminar, or internship requirement.
- `checklist`: a non-credit duty such as information-literacy training.

Each node records a localized title and explanation, minimum/maximum credits where relevant, whether credit reuse is allowed, its source citation, and its review status.

Evaluation returns a tree of `RequirementResult` objects containing status, earned/in-progress/planned credits, allocations, remaining amount, and a human-readable explanation. One course is allocated only once among sibling requirements by default. Students may manually choose an allocation or record an approved substitution; such changes are labelled “personal override.”

Programme templates are immutable after publication. Corrections create a new revision so existing plans remain reproducible and students can explicitly migrate.

## 4. Course catalogue and timetable ingestion

The public timetable is the authoritative source for current offerings. Model it as:

- `Course`: stable course code, multilingual titles, descriptions, faculty/domain, level, nominal ECTS, and known equivalents.
- `Offering`: one course in one term, with source identifier, teaching language, lecturer, status, and source URL.
- `Meeting`: exact date or recurrence, start/end time, room, type, and cancellation state.
- `ProgrammeAssignment`: the study-plan version and module path shown on the course detail page.
- `CatalogueSnapshot`: a complete validated import with source counts, start/end times, warnings, and publication state.

The ingestion job runs at 05:00 `Europe/Zurich`:

1. Acquire a PostgreSQL advisory lock so only one sync runs.
2. Read the result count and discover the full pagination range; never use a fixed page limit.
3. Fetch listing pages at a polite maximum of two requests per second with bounded retry and exponential backoff.
4. Parse course code, title, semester, schedule summary, lecturer, faculty/domain, and language.
5. Fetch changed or previously unseen detail pages; reuse cached detail data when the listing fingerprint is unchanged.
6. Parse ECTS, exact sessions, recurrence, assessment information, prerequisites, course equivalents, calendar link, and study-plan assignments.
7. Store raw HTML hashes and normalized staging records.
8. Validate expected page coverage, reported versus parsed counts, unique source identifiers, duplicate course codes within a term, required fields, and suspicious mass removals.
9. Diff the staged snapshot against the current snapshot.
10. Publish atomically only when validation passes; otherwise retain the previous snapshot and expose the failure in the admin status page.

A missing course is considered removed only after a complete valid crawl. Changed meetings generate change records for affected saved plans. The UI shows the old and new values and lets the student accept a suggested repair; it never silently removes or moves a selected course.

Study-plan source documents are checked weekly for content-hash changes. Detected changes create an internal review item and do not automatically rewrite verified programme rules.

## 5. Planning and suggestion engine

Conflict detection operates on actual meeting intervals rather than weekday labels. It handles weekly recurrences, alternating weeks, isolated dates, block courses, cross-midnight data errors, and cancelled meetings.

Conflicts have four states:

- `hard_conflict`: meetings overlap on at least one real date.
- `travel_risk`: adjacent meetings leave less than the configured campus-change buffer.
- `unresolved`: one or both offerings have incomplete time data.
- `clear`: all known dated meetings are compatible.

Suggestions are deterministic and explainable. The engine first enforces hard constraints: pinned courses stay fixed, prerequisites must be satisfied, selected offerings must exist in the term, and no proposed plan may introduce a new hard conflict. It then ranks candidates by:

1. Resolving existing clashes.
2. Covering compulsory or high-priority remaining requirements.
3. Staying near the student’s ECTS target.
4. Matching preferred teaching languages.
5. Respecting unavailable periods and desired free days.
6. Reducing long timetable gaps and travel risks.

Each suggestion states exactly what changes, which requirement it advances, its ECTS effect, why it ranks above alternatives, and any uncertainty. Applying a suggestion creates a reversible plan revision.

## 6. Interface and UniFr design language

Use the downloaded public UniFr header asset from [`assets/brand/unifr-logo.png`](../../../assets/brand/unifr-logo.png). Its provenance and checksum remain in [`assets/brand/README.md`](../../../assets/brand/README.md). Copy it into the frontend build unchanged; do not redraw, recolour, crop, stretch, or separate its bilingual wordmark from the UniFr symbol.

Create design tokens from the current UniFr corporate palette:

- Black: `#000000`.
- Night blue: `#0A3859`.
- Orange accent: `#D06516`.
- White and restrained neutral grays for backgrounds, borders, and secondary text.

Use black and night blue for the global shell, navigation, headings, and primary actions. Use orange for focus, selection, and limited emphasis, with contrast-safe foregrounds. Timetable course colours are a separate accessible functional palette and must not imply official faculty identity.

Use Arial for the first release because it is an approved available fallback and does not require obtaining a private web font. Typography should be restrained: strong hierarchy, short line lengths, tabular numerals for times/ECTS, and no decorative display font.

The desktop layout uses a UniFr-style white header with the logo, language switcher, plan switcher, and account/guest status. The main application has a narrow navigation rail and a large planning canvas. Mobile uses a compact header, bottom navigation, semester agenda, and day view. Dragging is optional convenience; every move, pin, and allocation action also has a keyboard- and touch-accessible control.

Routes:

- `/` — concise product introduction and “Start planning” action.
- `/setup` — programme, cohort, completed courses, preferences.
- `/plan` — whole-degree semester board and progress summary.
- `/semester/:term` — weekly/date timetable and conflicts.
- `/catalogue` — course search and filters.
- `/requirements` — sourced requirement tree and personal overrides.
- `/settings` — language, constraints, export/import, and optional account.
- `/admin` — protected sync status, snapshot history, parser warnings, and rule-review queue.

Meet WCAG 2.2 AA, including visible focus, keyboard operation, text alternatives, reduced motion, 44-pixel touch targets, and patterns/icons in addition to colour for status and conflicts.

No outreach or brand-approval task blocks implementation. The running prototype uses the checked-in public logo. Any later formal review or asset replacement is handled by the project owner after the application works.

## 7. Persistence and account model

Guest plans are stored in IndexedDB and can be exported as a versioned JSON plan file. Import validates the schema and shows a preview before adding a new plan.

Optional accounts use a username and password stored with Argon2id hashes. Account creation also generates one-time recovery codes. The first release sends no email and depends on no external identity or mail provider.

When a guest signs in, local plans are copied into the account as new plans; existing server plans are never overwritten. Server plan writes use revision numbers. A stale write produces a recoverable conflict copy and asks the user which revision to keep.

Store only planning data needed for the product. Do not request MyUnifr credentials, official transcripts, or sensitive personal data. Users can export or delete their account and plans.

## 8. API boundaries

Public read endpoints:

- `GET /api/v1/catalogue/courses`
- `GET /api/v1/catalogue/courses/{course_code}`
- `GET /api/v1/catalogue/terms`
- `GET /api/v1/programmes`
- `GET /api/v1/programmes/{template_id}`
- `GET /api/v1/status/catalogue`

Planner endpoints accept a complete plan snapshot and return results without mutating it:

- `POST /api/v1/evaluate`
- `POST /api/v1/conflicts`
- `POST /api/v1/suggestions`

Authenticated endpoints provide CRUD for plans and scenarios using revision-based optimistic concurrency. Admin endpoints expose import runs and manually publish reviewed programme-template revisions.

Generate an OpenAPI client for the frontend so API schemas, TypeScript types, and Python models cannot drift independently.

## 9. Repository structure

Use a small monorepo:

```text
apps/web/          React application and browser tests
apps/api/          FastAPI routes, persistence, auth, and migrations
packages/domain/   Python requirements/planning domain modules
packages/ingest/   UniFr fetchers, parsers, fixtures, and sync worker
data/programmes/   Versioned reviewed programme definitions and sources
assets/brand/      Downloaded UniFr visual assets and provenance
deploy/            Docker Compose, Caddy, backup and restore scripts
docs/              Research notes, data contracts, and operating guide
```

Keep parsers, requirements evaluation, conflict detection, and ranking as independent modules with typed inputs and outputs. HTTP routes and database adapters call these modules rather than containing domain logic.

## 10. Implementation sequence

### Task 1: Foundation and design shell

- [ ] Scaffold the monorepo, development Compose stack, database migrations, frontend routing, API health endpoint, formatting, type checking, and CI.
- [ ] Implement UniFr design tokens, accessible base components, responsive application shell, language switching, and unchanged logo rendering.
- [ ] Add visual and accessibility tests for desktop and phone breakpoints.

**Deliverable:** A deployable empty application in DE/FR/EN whose shell already matches the intended UniFr visual language.

### Task 2: Catalogue importer

- [ ] Capture representative listing, detail, block-course, missing-time, and calendar fixtures from the live timetable.
- [ ] Build listing/detail parsers and pagination discovery with failing fixture tests first.
- [ ] Add staging tables, snapshot validation, atomic publication, source caching, change detection, retry, and advisory locking.
- [ ] Run a full import and reconcile parsed counts with the live result count.

**Deliverable:** A complete searchable local catalogue and a trustworthy sync report.

### Task 3: Catalogue interface

- [ ] Implement catalogue API filters for text, term, faculty, language, level, ECTS, and time availability.
- [ ] Build course search, filter chips, course detail, source links, and schedule preview overlay.
- [ ] Mark stale catalogue age and incomplete meeting information visibly.

**Deliverable:** Students can find and inspect every imported course without using the UniFr timetable UI.

### Task 4: Degree and semester planning

- [ ] Define the versioned plan JSON schema and IndexedDB persistence.
- [ ] Build onboarding, completed-course entry, semester board, scenario duplication, pinning, and workload summaries.
- [ ] Build the date-aware weekly calendar, personal unavailable periods, conflict detection, agenda/day mobile views, and ICS/print export.

**Deliverable:** A guest can construct, save, compare, and export a multi-semester plan with accurate clash detection.

### Task 5: Requirements engine and programme research

- [ ] Implement `RequirementNode`, allocation, personal overrides, and `RequirementResult` using pure domain tests.
- [ ] Encode and cite the applicable 2024–2026 CS major and Business Informatics complementary-programme variants.
- [ ] Add earned/in-progress/planned/remaining views and explanations linking every verified rule to its source.
- [ ] Record the cross-faculty programme inventory and the order for future programme packs.

**Deliverable:** Supported students can see exactly what is complete, covered by plans, and still missing.

### Task 6: Explainable suggestions

- [ ] Implement candidate generation from equivalents, alternative offerings, eligible elective pools, and later semesters.
- [ ] Implement hard-constraint filtering and the documented ranking order.
- [ ] Build compare/apply/undo UI with an explanation and uncertainty section.

**Deliverable:** A student can resolve a real clash without surrendering control of the plan.

### Task 7: Accounts and synchronization

- [ ] Implement username/password authentication, Argon2id hashing, recovery codes, secure sessions, and rate limits.
- [ ] Implement guest-plan import, revision-based writes, conflict copies, account export, and account deletion.
- [ ] Verify isolation between accounts and safe behaviour on two devices editing the same plan.

**Deliverable:** Optional private cross-device synchronization with no email dependency.

### Task 8: Operations and release

- [ ] Package web, API, scheduler, and PostgreSQL services with Docker Compose and Caddy HTTPS configuration.
- [ ] Schedule the 05:00 Zurich import and weekly source-document check.
- [ ] Add health checks, structured logs, admin sync history, disk/DB monitoring, and alert hooks.
- [ ] Add nightly `pg_dump` backups before catalogue synchronization, with seven daily and four weekly copies, and prove restoration into a clean database.
- [ ] Run the complete acceptance suite against the deployed server.

**Deliverable:** A recoverable, observable self-hosted production installation.

## 11. Verification and acceptance

Parser tests must cover more than 99 pages, changed pagination, duplicate entries, missing ECTS, multiple weekly sessions, isolated dates, alternating weeks, block courses, cancelled sessions, language variants, detail-page changes, and incomplete crawls. A deliberate broken fixture must stop publication while leaving the last valid snapshot active.

Requirements tests must cover the CS 120-ECTS major, one 60-ECTS versus two 30-ECTS complementary programmes, the Business Informatics CS-major variant, compulsory and elective pools, fractional ECTS, equivalents, substitutions, non-credit duties, and prevention of accidental double counting.

Planning tests must prove that equal weekday/time meetings on different dates do not conflict, a single overlapping date does conflict, pinned courses never move, unknown times remain unresolved, prerequisites are explained, and suggestions never lower requirement validity without warning.

End-to-end browser tests run in German, French, and English at desktop and phone widths. They cover onboarding, catalogue search, adding a course, moving it between semesters, detecting a clash, comparing and applying a suggestion, marking a course complete, exporting ICS, refreshing offline guest data, and syncing an account between two sessions.

Accessibility tests combine automated Axe checks with keyboard-only execution of the core workflow. Brand checks verify the source logo checksum, aspect ratio, absence of CSS recolouring, UniFr token use, multilingual header wrapping, and contrast in every status state.

Production acceptance uses a realistic student history and proves this complete flow:

1. Select the applicable CS plus Business Informatics programme and cohort.
2. Enter completed courses and see correct earned/remaining credits.
3. Build a semester containing a genuine timetable collision.
4. Pin one course and apply an explained compatible alternative.
5. Confirm both weekly schedule and requirement progress update correctly.
6. Simulate an overnight timetable change and see the affected plan flagged without losing any choice.
7. Restore the database from backup and confirm the same plan and published catalogue return.

## 12. Defaults and later expansion

The first release uses manual completed-course entry, in-app change notifications, Arial, the checked-in public UniFr logo, a configurable 30-ECTS semester target, a 15-minute travel buffer, and guest-first onboarding.

After the first release is stable, add programme packs faculty by faculty using the same source/review workflow. Grade and attempt rules, transcript import, SWITCH edu-ID, MyUnifr integration, collaborative advising, and native mobile applications require separate designs and are not assumed by this plan.
