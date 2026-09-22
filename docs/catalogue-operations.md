# Catalogue operations

The authoritative source is the public [UniFr timetable](https://www.unifr.ch/timetable/en/).
The website posts a public search form to `assets/components/timetable/connector.php?action=getlist`.
Its observed page size is 12. Page count comes from every response's `nbrresultats`, with
no page-number cap. A temporary “Still loading” response is retried, never treated as empty.

## Run and inspect

From the repository root, with the project environment installed:

```sh
docker compose up -d db
PYTHONPATH=apps/api:packages/ingest/src .venv/bin/alembic upgrade head
PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.catalogue_sync --once
```

`UNIFR_DATABASE_URL` selects PostgreSQL (the Task 1 local default is used otherwise).
Exit 0 means published, 1 means rejected, and 2 means the run could not complete
(for example, another importer holds the lock). JSON is printed to stdout; progress goes
to stderr. `catalogue_snapshot.report` persists validation outcomes and source hashes.
Read `catalogue_head` to determine the actual published generation; staging is never a
publication. A failure before staging, such as unavailable PostgreSQL, is logged and
returns nonzero, and cannot mutate the pointer.

For an opt-in server process that waits until **05:00 Europe/Zurich** every day:

```sh
docker compose -f compose.yaml -f compose.catalogue.yaml up -d catalogue-sync
```

The scheduler computes the next Zurich wall-clock time after each run, including DST.
It sleeps in short intervals. The same database advisory lock excludes overlapping manual
and scheduled runs. No scheduled service was enabled during implementation.

## Publication contract

1. Acquire PostgreSQL session advisory lock `854712091` before any source request.
2. Fetch all reported listing pages at no more than two request starts per second.
   Each request has a 30-second timeout and at most four attempts with 1/2/4-second
   backoff. Raw public responses, ETags and Last-Modified values are cached in PostgreSQL.
3. Reuse a recently checked detail only when its normalized listing fingerprint matches.
   Unseen/changed listings and details checked at least 24 hours ago are fetched, with
   conditional HTTP requests when supported. Thus detail-only changes are periodically
   revalidated, even with unchanged listing text.
4. Parse exact dates from the detail's Dates and rooms table; retain its recurrence summary,
   assessment, prerequisites, equivalences, multilingual titles, ECTS and study-plan assignments.
   An unpublished ECTS is `None`; unknown time is an explicit unresolved meeting.
   Source language labels are retained in listing provenance and mapped to ISO codes in
   offerings for filtering and suggestions; unspecified “Bilingual”/“Other” remain unknown.
   Incomplete inline formatting tags at an explicit table-cell ending are escaped before
   parsing (observed in a CMS-truncated bibliography). This cannot restore truncated prose;
   original bytes remain cached and hashed. Missing cell/table/document boundaries still
   reject the detail instead of being silently repaired.
   Timetable `UE-` teaching-unit prefixes are preserved in catalogue data. The degree evaluator
   matches only the exact numeric academic-code namespace (e.g. `UE-SIN.01023` / `SIN.01023`),
   never titles or distinct course numbers. Both spellings cannot count as separate courses.
   The downloadable calendar URL is retained. `parse_calendar` separately supports RRULE,
   EXDATE, RDATE, recurrence overrides, cancellations and UTC/Zurich DST conversion; normal
   imports use authoritative detail-table dates and do not additionally download every ICS.
5. Recheck **every listing page** after detail processing. Every normalized listing field,
   per-page count, and page size must be unchanged across the two passes. Discover additional
   pages if a later response reports a larger total. Validate full page coverage against the
   largest advertised count, exact page lengths, listing/detail identity, unique source IDs,
   unique code per term,
   required fields, and removals above 20% of the previous catalogue. A multi-semester
   offering occupies each listed term. Duplicate code/term pairs block publication for
   operator review rather than being merged silently. UniFr caches pages independently: on
   2026-09-21 page 1 advertised 3,662 while a freshly generated equivalent page and subsequent
   pages advertised 3,664. Mixed cached counts are a recorded warning **only** when the complete
   unique listing/detail set reconciles to the largest count and the full second index pass
   is identical. Missing or changing pages still reject the generation. No count is guessed,
   no records are silently dropped, and a loading response is never considered an empty page.
6. Persist normalized staging and the report. Only a valid staged generation may atomically
   update `catalogue_head`; publication revalidates and checks that persisted staging equals
   the candidate. The same transaction appends affected-plan change records. Existing plan
   references and historical offering snapshots are preserved even if a course is removed.

`rejected_due_to_source_change` is an unsuccessful crawl. Restart only after inspecting
the observed counts; never relabel a partial scrape as complete. A suspicious removal
requires source/term review and a deliberate policy change; there is no unchecked force flag.

Parser revisions invalidate normalized detail records even when the source listing has not
changed. A recent published detail can be reparsed from its fingerprint-scoped raw cache only
when the exact content hash matches and both timestamps are less than 24 hours old; its original
source-check timestamp is retained. Otherwise the normal fetch/retry path applies. Internal
parser revisions are not exposed in public offering responses.

Tutor list items are separated with commas. Prerequisites recognize the source's singular
“Condition of access” label as well as older aliases. Schedule lines and assessment sections
retain source line breaks, headings, and table labels, including text nested under repaired
HTML break elements; the course detail view preserves these breaks visually.

The 2026-09-21 parser audit reparsed all 3,664 downloaded public details: 3,374 tutor
lists (5,339 names, 857 multi-person lists), 250 nonempty prerequisites, 3,606 assessment
sections with 7,848 headings, and 2,918 schedule texts retained their source content.
Against 3,663 prior successful parses, all 42,366 meeting records, 47,800 programme
assignments, and ECTS values were unchanged. Course 134176 had no old successful baseline.

The production scheduler retries failed/rejected catalogue jobs after 15 minutes, then one hour,
then at most every four hours (or the next regular 05:00 run if sooner). Validated detail responses
are checkpointed for one hour, keyed by the complete listing fingerprint, so a retry can reuse
recent downloads without publishing an incomplete generation. Invalid detail HTML is retried
before caching. Expired checkpoints are revalidated over HTTP; changed listings bypass them.

After a backed-up scheduled import, retention keeps seven published generations and three
rejected/staged generations per status, always protecting the current head. Raw response caches
expire after 30 days of disuse. Student plans, embedded historical course data, and plan change
notices are never pruned by this policy. Backups retain their independent seven-day/four-week
rotation. The standalone development `catalogue_sync` command does not run retention.

## Task 3 integration boundary

`unifr_ingest.ports.CatalogueReader` defines typed `search(query, term, limit, offset)`
and `get(source_id)` methods returning immutable `Offering` models. The API adapter is
`unifr_api.catalogue.SqlCatalogueRepository(engine)`. Search includes code, all titles,
lecturer and faculty/domain, uses literal escaped matching, and filters only the current
published generation. No catalogue endpoint or UI is added by this task.

The eventual plan repository should call `track_plan(plan_id, source_id)` when registering
a catalogue choice. `plan_changes(plan_id)` returns immutable `meetings_changed` and
`offering_removed` events including old/new values. Choice removal/unregistration and
notification acknowledgement belong to the future plan feature, not this importer.

## Verification and current live boundary

```sh
.venv/bin/pytest packages/ingest/tests apps/api/tests/test_catalogue.py apps/api/tests/test_migrations.py
UNIFR_TEST_DATABASE_URL=postgresql+psycopg://unifr:unifr_dev@localhost:5432/unifr .venv/bin/pytest apps/api/tests/test_catalogue_postgres.py -q -s
```

SQLite is permitted only through the explicit `allow_sqlite=True` test adapter flag; a
production instance refuses it because SQLite cannot supply PostgreSQL advisory locks.
Integration tests use disposable, uniquely named schemas and verify lock exclusion,
successful publication, and broken-fixture rejection with the exact old pointer preserved.

On 2026-09-17, complete-crawl attempts were rejected because the public listing mixed **3,658**
and **3,660** results across pages. Investigation on 2026-09-21 reproduced this with 3,662/3,664:
all 306 pages contained exactly 3,664 unique offerings, and only the cached first page advertised
the lower total. A freshly generated equivalent first-page request advertised 3,664. Session
cookies and ordinary HTTP cache-busting did not change the stale response. The reconciliation
contract above fixes this without treating either inconsistent counts or partial coverage as
success. Publication still waits for every detail and the complete second index pass.

The current release gate is a real public import followed by public API/browser verification.
Check `/api/v1/status/catalogue` for the deployed generation, freshness and last outcome; do not
infer deployment state from historical local reports. Fixture catalogues exercise the contract
but must never be installed as authoritative production data.

## Historical semesters

Migrations 0006/0007 add immutable read projections, per-term archive heads, public discovery
metadata and private resumable checkpoints. Deploy the migrated API before the web release.
The scheduler discovers the public semester selector, queues past semesters newest first,
and works in bounded slices between current-catalogue jobs using the same lock and rate
limit. Initial backfill is gradual; manual completed-course entry is immediately available.

Each semester must pass complete listing/detail validation and a fresh full-index recheck
before its own head moves. A failed semester backs off independently, retains the prior
head, and never emits current-course removal notices. Transport failures retain resumable
checkpoints; invalid source changes restart that semester. Archives refresh every 30 days.
Retention preserves every archive head and seven current publications independently.

`GET /api/v1/catalogue/terms?scope=history` is the public coverage view. Missing coverage
means no advertised/imported semester, not that a student earned no credits. API roles
can read archive heads/discovery metadata and projections, but cannot read raw caches or
checkpoints or write any catalogue table. No university credentials or outreach are used.
