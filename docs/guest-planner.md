# Guest degree and semester planning

Guest plans are saved in this browser's IndexedDB without an account or email.
Sharing is optional and publishes the chosen plan content to the server; private
account sync is also optional. JSON backups preserve the complete local plan.
Clearing browser data removes local plans and guest share ownership keys, so
export a backup before changing devices.

## Planning a semester

Create a local plan by configuring your studies: degree level, main programme,
variant, degree structure, and required minors or specialisations. This is the same
configuration used by **Study requirements**. Each component keeps its own starting
semester and pinned curriculum edition. Degree credits come from the selected
structure; the programme name is display metadata, not an academic matching rule.

Review the combination and any unresolved source details, choose the planning
semester and save. The complete plan is saved once. Continuing students can record
past credits before proceeding to the semester catalogue. An explicit **My programme
or combination is missing** option creates a manual plan without degree recommendations.
Existing plans remain usable and offer a non-blocking configuration prompt. Changing
studies preserves course records and requires explicit handling of personal requirement
evidence when switching curricula.

**New plan** on **My studies**, also in the header on wider screens, starts setup for an
additional plan; existing plans stay unchanged, and **Current plan** in the header switches
between them.

After setup, choose semester courses directly. **Add courses** on any semester card
also opens the catalogue filtered to that semester. Each offering has a semester selector
and **Add to plan** action directly in the results and on its detail page.
The selected semester is saved together with the course; a matching published
semester is selected by default when browsing without a semester filter.
**Unscheduled** remains an explicit option for courses to allocate later.

After saving, **View weekly timetable** opens the course's semester. The calendar
starts in week view, has a semester selector and an **Add courses** action, and
links back to the degree plan to allocate any unscheduled courses. Missing or
future dates remain unresolved. A blank calendar does not claim that its schedule
is conflict-free. Starting setup from a course returns to that course after the
plan has been saved.

Earned-credit totals and the selected planning semester precede semester cards, scenario tools and
backup controls on the degree plan. Planning terminology is available in DE/FR/EN.

## Starting midway through a degree

Study start and planning semester are separate. Setup offers a skippable, resumable
`/plan/completed` checklist when planning begins after study start. Existing plans default
to the Zurich current semester within their range, then the nearest future or latest
existing semester; this does not change the study cohort or degree requirements.

Select archived courses semester by semester, review the earned credits and save them
together. For unavailable archives or offline use, manual entry needs only a title and
credits; the official course code is optional. Records without one get an internal ID
that is hidden in the interface. The semester can be earlier/unspecified. Manual records
can be edited or removed. A canonical duplicate requires explicit conversion of the
existing course, and pinned courses must first be unpinned.

Completed courses contribute to earned-credit totals and applicable degree requirements,
but do not create timetable events, conflicts or current-semester workload. A manual
record does not itself establish degree recognition. Planning semester and completion
records survive JSON export/import, account sync and shared-plan import.

## Assisted course discovery

With a saved plan, the catalogue opens on its planning semester unless a semester
is already in the URL. The visible semester selector changes the catalogue and
the running semester overview together. Filters and search remain in the URL;
clearing the term explicitly allows browsing other semesters.

Recommendations are ranked and filtered across the complete matching catalogue,
before pagination. They use the saved requirements, exact course codes and catalogue
assignment evidence. A candidate must advance an outstanding requirement after the
same allocation rules used by the requirements view are evaluated. Completed and
already scheduled courses do not appear as new recommendations; unscheduled records
can be assigned without duplication. Required courses precede electives and additional
studies, with prerequisite readiness, timetable fit and credit contribution as further
ranking criteria. Additional studies stay outside the degree total.

Configured plans default to **Recommended for your degree**; **All courses** remains
available. Without configuration the catalogue offers all courses and a setup prompt,
without guessing from the programme name. No recommendations can mean covered
requirements, absent offerings or incomplete mappings; an empty list never establishes
degree completion. Recommendations explain their requirement contribution, while
source-review gaps and unknown prerequisites remain visible.

Each result shows grouped lesson times, rooms, actual date counts and known
clashes. **Only courses that fit** checks dated meetings, personal unavailable
periods and travel buffers. Incomplete source dates or an incomplete existing
timetable remain unknown and are excluded by this filter. Unstructured
prerequisite text is not treated as proven eligibility.

The semester overview updates selected courses, known ECTS, unknown credits,
conflicting course pairs and unresolved dates after a successful save. Removing
a course keeps it as unscheduled; **Add to semester** can add it back using the
displayed offering without duplicating the course. Pinned courses cannot be removed here. Links
open the weekly timetable or the existing reviewable schedule suggestions.

The weekly timetable places lessons at their Zurich local times, gives
overlapping events separate lanes and splits overnight events across dates.
Colours identify courses; explicit labels identify conflicts. The calendar
scrolls within the page on small screens. Day and semester agenda views, print
and ICS export remain available.

## Versioned plan contract

The authoritative executable schema is `apps/web/src/planner/domain.ts`
(`planSchema`, `selectionSchema`, `meetingSchema`). It is independent of React,
IndexedDB and network clients; catalogue types are imported only at type level.
The canonical semester identifiers are `AS-YYYY` and `SS-YYYY`. Calendar routes
also accept `HS-YYYY` and `FS-YYYY` aliases. Semester calendar windows are August
through January and February through July, respectively, and are planning
containers rather than claims about teaching or examination dates.

```json
{
  "schemaVersion": 1,
  "id": "plan-example",
  "name": "My degree",
  "programme": "Informatics",
  "targetEcts": 180,
  "semesters": ["AS-2026", "SS-2027"],
  "activeScenarioId": "scenario-main",
  "scenarios": [
    {
      "id": "scenario-main",
      "name": "Main",
      "courses": [],
      "unavailable": [],
      "travelMinutes": 0
    }
  ]
}
```

A course selection stores `id`, `code`, localized `titles`, nullable `ects`,
`status` (`completed`, `current`, `planned`, `unscheduled`), nullable `semester`,
`pinned`, and nullable `offering`. The offering snapshot retains source ID, terms,
meeting objects, meeting resolution state, source URL, catalogue snapshot ID,
and development-fixture flag. Meeting objects retain dated starts/ends,
recurrence, source UID, recurrence ID, exclusions, additional dates, cancellation,
location and notes. Completed courses entered manually have no offering.

An unavailable period is `{ id, label, start, end }` with explicit UTC/offset
timestamps and a strictly positive duration. Date/time inputs are interpreted in
Europe/Zurich; ambiguous repeated times and nonexistent daylight-saving times
are rejected instead of guessed.

Validation rejects unknown fields and versions, malformed dates, negative or
nonfinite ECTS, duplicate scenario/course/period IDs, duplicate course codes,
missing scenario references, absent or unknown semester allocations and
contradictory statuses. Caps: 5 MB serialized import, 24 semesters, 20 scenarios,
500 courses and 500 unavailable periods per scenario, 1,000 meetings per
offering, 1,000 exceptions per meeting. Titles and source text are length-bounded.
The runtime refinement rules are part of the schema contract. The 5 MB UTF-8
limit applies per plan, including all its scenarios, to both the input and its
indented export representation. Saving uses the same validation as reading and
importing, so a successful save always has an importable JSON backup. Independent
valid plans may collectively exceed 5 MB.

The documented v0 envelope is exactly the v1 shape except `schemaVersion: 0`
and absence of `activeScenarioId`; the first scenario is its active scenario.
`parsePlan` deterministically upgrades that envelope in memory. It does not
guess missing courses, unknown fields, new schema versions or invalid values.
This compatibility fixture is tested, not a claim that a v0 planner was deployed.

JSON import requires validation and an explicit preview before adding a new
plan. A shared link displays its plan before the recipient chooses to import it. The new root plan ID is generated locally; source content and scenarios
are preserved. Existing plans are not overwritten. Changing the import text
invalidates the preview. JSON export preserves all scenarios and unavailable
periods, including information that cannot currently be scheduled.

## Persistence and editing

Database `unifr-planner`, version 3, has `plans` (key path `id`), `preferences`
(key `activeId`) and `revisions` (keyed by plan ID). Version 1 contains only the
`plans` store; version 2 adds preferences; version 3 adds the latest reversible
suggestion revision. Each upgrade preserves existing records. Reading validates
every plan and both sides of every stored revision and performs the documented
JSON migration. Each unreadable or oversized record is reported and left
untouched; the other valid plans still load. A visible warning persists while
valid plans remain usable, and an unreadable active selection falls back to a
valid plan. No record is automatically repaired or deleted. Stored legacy plans
are rewritten as v1 JSON only on an explicit subsequent save.

Plan and active-plan selection are saved in one IndexedDB transaction. Applying
or undoing a suggestion atomically updates the plan, active selection and latest
revision after comparing the stored plan with the expected before/after value;
a stale other-tab edit is rejected instead of overwritten. The UI reports
success only after transaction completion, and retains the previous committed
state after failure. Controls are disabled during writes. Scenario duplication
makes an independent validated copy of courses, pins and unavailable periods.
All allocation/status/pin controls use native keyboard/touch controls; no drag
interaction is required. Ordinary edits still have no automatic cross-tab merge;
the stale guard applies specifically to suggestion apply/undo transactions.

Completed/current/planned/unscheduled ECTS remain separate. Unknown ECTS are
counted and never treated as known zero. Workload is an estimate of 25–30 hours
per known current/planned ECTS, not a degree-recognition decision. Programme and
target credits are derived from the selected degree; only manual fallback plans use
personal labels and targets. The requirements page binds explicit programme
revisions and retains personal allocation evidence per scenario; see
[programme research](programme-research.md) for supported sources and unresolved
rules. Existing plans remain unbound until the user selects a programme.

## Calendar rules and export

Calendar calculations compare actual timestamp intervals, never weekday/time
alone. Overnight intervals retain the following date. Recurrences expand in
Europe/Zurich wall time before conversion to UTC, preserving local class times
through daylight-saving changes. Bounded DAILY/WEEKLY/MONTHLY/YEARLY rules are
supported through the pinned `rrule` library, with positive intervals/counts,
up to 2,000 generated instances per source meeting. Supported RRULE field values,
numeric ranges, duplicate fields and frequency/selector combinations are validated
before expansion; malformed values such as `BYMONTH=13` remain unresolved rather
than silently becoming an empty calendar. EXDATE/RDATE and source-UID
RECURRENCE-ID replacements/cancellations are applied before conflicts.

Unbounded/high-frequency/invalid rules, missing timestamps, ambiguous overrides,
and courses without a matching semester offering are explicitly unresolved.
The catalogue's coarse `meeting_state` also marks complete recurrence metadata
unresolved because catalogue availability filters do not expand it. The planner
can resolve that case only by successfully validating and expanding the actual
meeting objects; missing or invalid individual meeting data remains unresolved.
Moving a course to a future semester preserves its source snapshot but never
reuses its old dates as if a future offering existed. Rejected/unavailable live
catalogue data stays unavailable; deterministic demonstrations use the existing
opt-in catalogue fixture and retain its visible provenance.

Hard conflicts use half-open intervals: touching boundaries alone do not clash.
The optional travel buffer applies between distinct or unknown locations.
Personal unavailable periods produce a distinct conflict kind. The UI reports
all dated conflicts plus unresolved courses; unknown timing never produces a
claim that the complete schedule is clear.

ICS export includes the selected semester's resolved meetings and intersecting
personal unavailable periods. It exports bounded UTC VEVENT instances, rather
than embedding recurrences, so exported dates exactly match the evaluated
calendar, including moved events and DST. Explicit cancellations use
`STATUS:CANCELLED`; excluded instances are absent. Text is escaped, UTF-8 lines
are folded at 75 octets and records use CRLF. Any unresolved selected schedule
disables the complete ICS export; the full JSON backup remains available.
This is a snapshot export, not a live subscription or a promise that repeated
imports into every calendar client remove previously imported events.

Agenda/day/week views share the dated event set. Phone week view scrolls horizontally within its calendar panel. The existing
semester print action prints the whole semester agenda and conflict information.
The separate weekly download controls export only the selected week.

## Live share links

Choose **Share plan** from the degree plan or semester heading, then **Create
share link**. The link shows the active scenario across every semester and
updates automatically after saved changes while the owning browser is online.
Recipients already viewing it refresh automatically within 15 seconds. Other
scenarios and private requirement evidence are excluded. Personal unavailable
periods are excluded unless explicitly included before creating the link.
Anyone holding the link can read it; it is not an invitation to collaborate.

Only the original browser's private ownership key or the account signed in when
the link was created can change or revoke it. An unrelated signed-in account
has the same read-only view as a guest. **Edit original** verifies ownership and
loads the latest shared version into a local plan, preserving existing local
plans. **Import as my plan** always creates an independent editable copy with a
new ID and no ownership credentials. Importing does not subscribe the copy to
future changes. **Stop sharing** makes the old link unavailable; creating a new
share produces a new link.

Ownership keys remain in IndexedDB preferences, separate from plan snapshots,
JSON backups, account exports and Excel files. Lost browser data cannot recover
a guest ownership key. Creating a link while signed in additionally associates
it with that account, allowing the account owner to edit on another browser.
The owner must reopen that link to attach an editor on the other browser.
Concurrent publication reports a conflict instead of replacing newer changes;
reopen the shared link to load its latest version. Failed publication leaves
local edits saved and offers retry from the share dialog.

## Weekly print and Excel downloads

Open **Semester**, select a semester and week, and use the controls below the
calendar. They are also available on read-only shared plans.

- **Print week / save PDF** opens a landscape A4 preview. Its print button uses
  the browser's print dialog, including Save as PDF where available. The first
  page is a coloured weekly grid with notes space; subsequent pages contain
  every lesson's full title, exact time and room.
- **Download Excel** creates an editable `.xlsx` file. The weekly sheet has
  coloured lessons, 15-minute rows, frozen headings, free cells and a notes area
  for personal additions. A second sheet lists exact dates/times, locations,
  overlaps and available course source URLs. Both sheets have print settings.

Exports use Zurich local dates and the same resolved meetings as the calendar,
including overnight splits and overlapping lessons. Incomplete source schedules
are marked explicitly. Downloads are snapshots; later plan edits do not change
files already saved. Excel cells are unprotected and course text is written as
literal text, never evaluated as formulas.

## Reproducible verification

```sh
NODE_OPTIONS=--no-experimental-webstorage npm test
npm run typecheck
npm run lint
npm run build
NODE_OPTIONS=--no-experimental-webstorage npm run test:e2e -- --workers=3
```

The Node flag avoids Node 26's experimental web-storage collision with the
existing jsdom test harness. The repository's pinned Node version remains in
`.node-version`. Browser tests run the existing deterministic, isolated SQLite
catalogue services on ports 8001/8002 and Vite on 4173, including a rejected
catalogue positive control. No production catalogue or account data is used.
