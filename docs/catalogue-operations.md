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
   The downloadable calendar URL is retained. `parse_calendar` separately supports RRULE,
   EXDATE, RDATE, recurrence overrides, cancellations and UTC/Zurich DST conversion; normal
   imports use authoritative detail-table dates and do not additionally download every ICS.
5. Recheck the first listing after detail processing. Validate full page coverage, constant
   counts/page size, listing/detail identity, unique source IDs, unique code per term,
   required fields, and removals above 20% of the previous catalogue. A multi-semester
   offering occupies each listed term. Duplicate code/term pairs block publication for
   operator review rather than being merged silently.
6. Persist normalized staging and the report. Only a valid staged generation may atomically
   update `catalogue_head`; publication revalidates and checks that persisted staging equals
   the candidate. The same transaction appends affected-plan change records. Existing plan
   references and historical offering snapshots are preserved even if a course is removed.

`rejected_due_to_source_change` is an unsuccessful crawl. Restart only after inspecting
the observed counts; never relabel a partial scrape as complete. A suspicious removal
requires source/term review and a deliberate policy change; there is no unchecked force flag.
No retention pruning is automated yet: historic snapshots, outbox events and source cache
remain available for audit and need an operational retention policy as usage grows.

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

On 2026-09-17, three complete-crawl attempts were started and rejected because the public
listing mixed **3,658** and **3,660** results across pages. The latest stored rejected run is
`323188c6-d406-48f4-b940-1a8fb99ce2c6`. The local production pointer is still empty; a complete
authoritative catalogue is **not yet available**. The searchable fixture catalogue in tests
demonstrates the repository contract but is never installed as authoritative production data.
