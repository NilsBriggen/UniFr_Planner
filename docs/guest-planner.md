# Guest degree and semester planning

Guest plans are stored only in this browser's IndexedDB. No identity, email,
account, evaluation API or recommendation service is involved. JSON backup is
the transfer mechanism. Clearing browser data removes local plans; exporting a
backup before changing devices is necessary.

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

Import always requires validation and an explicit preview before adding a new
plan. The new root plan ID is generated locally; source content and scenarios
are preserved. Existing plans are not overwritten. Changing the import text
invalidates the preview. JSON export preserves all scenarios and unavailable
periods, including information that cannot currently be scheduled.

## Persistence and editing

Database `unifr-planner`, version 2, has `plans` (key path `id`) and `preferences`
(key `activeId`). Version 1 contains only the `plans` store; the upgrade adds
preferences without deleting old records. Reading validates every record and
performs the documented JSON migration. Each unreadable or oversized record is
reported and left untouched; the other valid plans still load. A visible warning
persists while valid plans remain usable, and an unreadable active selection
falls back to a valid plan. No record is automatically repaired or deleted.
Stored legacy records are rewritten as v1 JSON
only on an explicit subsequent save.

Plan and active-plan selection are saved in one IndexedDB transaction. The UI
reports success only after transaction completion, and retains the previous
committed state after failure. Controls are disabled during writes. Scenario
duplication makes an independent validated copy of courses, pins and unavailable
periods. All allocation/status/pin controls use native keyboard/touch controls;
no drag interaction is required. Plans should be edited in one tab at a time;
there is no cross-tab merging or conflict-resolution protocol in this version.

Completed/current/planned/unscheduled ECTS remain separate. Unknown ECTS are
counted and never treated as known zero. Workload is an estimate of 25–30 hours
per known current/planned ECTS, not a degree-recognition decision. Programme and
target credits are personal labels; requirements evaluation is future scope.

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

Agenda/day/week views share the dated event set. Phone week view stacks dated
days; the print view prints the whole semester agenda and conflict information,
regardless of the currently selected on-screen day/week.

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
