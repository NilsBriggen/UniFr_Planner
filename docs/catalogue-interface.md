# Catalogue exploration

`/catalogue` searches the published SQL catalogue; `/catalogue/{course_code}` shows every
offering for that exact course. The interface supports German, French and English, URL-based
search/filter selections, removable filter chips, pagination, course metadata, source links,
meeting resolution and an accessible schedule dialog. It never writes student choices.

## Public contract

- `GET /api/v1/catalogue/courses`: `q`, `term`, `faculty`, `language`, `level`, `ects_min`,
  `ects_max`, `available_day`, `available_from`, `available_until`, `limit`, `offset`.
- `GET /api/v1/catalogue/courses/{course_code}`: exact code, all published offerings.
- `GET /api/v1/catalogue/terms`: terms and faculty/language/level facets from the same snapshot.
- `GET /api/v1/status/catalogue`: availability, reason, generation, published time, age in
  seconds, stale flag, latest staged/published/rejected sync outcome, development provenance.

Text search is a literal case-insensitive substring across code, multilingual titles,
lecturer and faculty/domain. `%` and `_` have no wildcard meaning. Other metadata filters
are exact and case-insensitive, and all filters must match the **same offering**. Course
codes are sorted deterministically; pagination counts courses, with 20 per page by default
and a maximum of 100. `codes` accepts comma-separated exact canonical course codes. Unknown ECTS and levels cannot satisfy those filters. Levels are now
retained from the source detail's Level field. Older stored generations remain readable,
with unknown level until imported again; no backfill infers metadata.

Availability is one weekday window in **Europe/Zurich**. Monday is `0`, Sunday is `6`;
start/end use `HH:MM`. All three values are required together. Every active meeting must
fall on that weekday, on one local date, within the inclusive bounds. Cancelled meetings
do not constrain the window. A course with no active meetings, missing times, unresolved
meetings or unexpanded recurrence/additional dates is excluded. This is a conservative
catalogue filter, not a clash detector or proof that unknown times are free. Recurrence
expansion and degree-plan editing are outside this task.

Malformed values, unknown filter names and reversed ranges return HTTP 422. Missing exact
courses return 404. Catalogue reads return 503 when there is no published generation or
the database is unavailable. Status remains readable and distinguishes those causes.
A valid published catalogue with zero courses returns 200 with an empty result set.
Snapshots older than 48 hours are explicitly stale; a rejected later sync is displayed
alongside the retained last published generation. With no published generation, the UI
shows unavailable/rejected status, never a misleading empty catalogue.

The read service resolves the published head once and reads immutable rows by that ID.
It never reads staged offerings into search results and never changes publication guards.
Filtering, course counting and pagination use indexed SQL projections. Status and facets
read only generation metadata. Full offering records are decoded only for the requested
page or detail. `/catalogue/discovery?term=AS-2026` provides the complete compact semester
index, cached by immutable generation; programme ranking and clash checks run in a browser
worker. Search stays editable during loading, requests abort after 15 seconds, and saved-plan
source checks request only exact `codes` (up to 100 canonical codes per batch).

`scope=history` on courses, course detail and terms selects independent published archive
heads. Each offering includes its own `snapshot_id` and source URL. Terms include `coverage`
with pending/loading/available/failed states, last successful check, and failed-refresh flags.
No published archive returns 503 for that semester; an available archive with no matches
returns 200 and zero results. A failed refresh retains the prior valid archive. Archives
never substitute current offerings for historical credits. See [archive operations](catalogue-operations.md).

## Generated client

The committed OpenAPI JSON and TypeScript schema live under `apps/web/src/api/`. The web
client uses `openapi-fetch` with generated paths; it does not maintain independent API
types. After changing the Python public models/routes, run from the repository root:

```sh
npm run api:generate
```

The command uses `.venv/bin/python`, then pinned `openapi-typescript`; CI regenerates and
fails on contract drift. Set up both `uv sync --frozen` and `npm ci` first.

## Explicit development snapshots

The live 2026-09-17 crawl was rejected because source counts changed between 3,658 and
3,660. This feature does not claim or install a complete live snapshot.

For a local demonstration, start the API below and point Vite at it:

```sh
PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.catalogue_demo --port 8001
API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev
```

The command creates its own temporary SQLite database and stages/publishes 24 explicit
examples through the existing repository validation path. Every UI page labels them as
development data, with a deliberately three-day-old snapshot and an unresolved course.
The example source links are structural examples, not evidence of live course identity.
The command never accepts or uses a configured production database, and cleans its temporary
directory on normal shutdown. SQLite is enabled only by the explicit development adapter.

Use `--rejected --port 8002` for a separate rejected-only database with no published head.
Playwright starts both APIs and a Vite instance automatically. The rejected-state browser
test forwards requests to that real second API; no catalogue responses are mocked.

```sh
.venv/bin/pytest
UNIFR_TEST_DATABASE_URL=postgresql+psycopg://unifr:unifr_dev@localhost:5432/unifr .venv/bin/pytest apps/api/tests/test_catalogue_postgres.py
npm test
npm run typecheck && npm run lint && npm run format:check && npm run build
npm run test:e2e -- --workers=2
```

The project pins Node 24.7.0. On the workstation's Node 26, run unit tests with
`NODE_OPTIONS=--no-experimental-webstorage npm test` to avoid the known Node web-storage
and jsdom collision; browser tests use real browser storage. CI uses the pinned Node version.
