# Development

Use Node 24 (`.node-version`), npm 11.6.0, Python 3.13 and uv 0.11.23.
`package-lock.json` and `uv.lock` pin dependencies.

## Start locally

```sh
npm ci
uv sync --frozen
docker compose up --build
```

Open http://localhost:5173. Compose starts PostgreSQL, applies Alembic migrations,
and waits for API/database readiness. Its credentials and loopback bindings are for
local development. `docker compose down` retains the database volume; adding
`--volumes` deletes that local database. Set `DB_PORT`, `API_PORT` or `WEB_PORT` if a
default port is occupied.

For host processes, start PostgreSQL separately and set `UNIFR_DATABASE_URL` from
`.env.example`, then run these commands in the appropriate terminals:

```sh
uv run alembic upgrade head
PYTHONPATH=apps/api:packages/domain/src:packages/ingest/src uv run uvicorn unifr_api.main:app --reload
npm run dev
```

Vite proxies `/api` to port 8000; `API_PROXY_TARGET` overrides the upstream.
`/api/health` checks process liveness. `/api/ready` attempts a bounded database
connection and returns 503 on failure. Migrations include catalogue history,
accounts, sharing and archives; a running API requires the current migration head.

For disposable browser fixtures without live ingestion or production data:

```sh
PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.catalogue_demo --port 8001
API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev
```

The fixture is visibly labelled as development data. Public ingestion, validation and
publication commands are in [catalogue operations](catalogue-operations.md).

## Product structure and persistence

The main navigation has **Timetable**, **Courses** and **My studies**. Settings is in
the header. Existing `/semester/:term`, `/catalogue`, `/catalogue/:course_code`,
`/plan`, `/requirements`, `/plan/completed`, `/suggestions`, `/settings` and shared-plan
links remain addressable. Routes load lazily with loading/error feedback.

New setup uses two steps: choose studies, then review and start. Programme search
narrows a native select; faculty is optional. A sole valid variant/structure can be
selected automatically. Semester fields display season and year while storing the
canonical `AS-YYYY`/`SS-YYYY` values. Component cohort dates, the planning semester and
pinned recipe editions remain distinct. Optional settings contain the plan name and
planning horizon. Manual setup and skipping completed-course entry remain possible.
A setup creates the whole plan with one save; missing academic evidence remains
`needs_clarification` rather than becoming a completion claim.

Guest plans use schema-v1 JSON and IndexedDB version 3. `PlanStore.save(next,
expectedPrevious)` requires the caller's committed baseline; `null` means the ID must
not already exist. Comparison and writing happen in one transaction. A
`PlanConflictError` preserves the attempted edit for the global recovery notice;
storage errors do not advance committed state. Recovery can load the latest version
or save the attempt under a fresh ID. Pending recovery lives in memory until saved,
so reloading a tab can discard that unsaved attempt. Successful saves/apply/undo send
an invalidation over BroadcastChannel; focus reload is the fallback. Neither path
broadcasts unsaved drafts.

Calendar view/date preferences use sessionStorage scoped to plan, scenario and
semester. They are presentation state, excluded from plan JSON and account payloads.
An untouched calendar opens today during the selected semester, otherwise on its
first known meeting or semester start. Invalid stored dates fall back safely;
explicit week/day choices survive route changes within the tab. Calendar calculations
use Europe/Zurich. Catalogue filters remain in the URL; list position is navigation
state. A view change must not mark the academic plan as changed.

`apps/web` contains React/TypeScript UI and browser adapters; `apps/api` contains the
FastAPI service and persistence adapters. `packages/domain` contains the TypeScript
academic/planning rules and Python domain modules. `packages/ingest` owns Python
source adapters and ingestion. [Programme recipes](programme-recipes.md) describes
configuration compilation and review boundaries. The supplied logo asset remains
unchanged.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run recipes:check
npm run recipes:test
npm run build
npx playwright install chromium
npm run test:e2e -- --project=desktop
npm run test:e2e -- --project=phone
uv run pytest
uv run ruff check apps/api packages scripts/test-response-compression.py
uv run ruff format --check apps/api packages scripts/test-response-compression.py
uv run mypy
```

On Node 26, prefix unit-test commands with
`NODE_OPTIONS=--no-experimental-webstorage`; experimental host storage globals
otherwise conflict with jsdom. CI uses Node 24.

PostgreSQL concurrency/role tests require `UNIFR_TEST_DATABASE_URL` pointing at a
**disposable test database**, with sufficient permissions for temporary schemas and
roles. Without it, these checks skip; an otherwise green pytest run does not verify
PostgreSQL behavior. Never point test commands at production.

Run browser projects separately for fresh disposable account backends and independent
authentication rate-limit budgets. `E2E_PORT=4183` changes the frontend port; the fixture
API ports in `apps/web/playwright.config.ts` must also be free. Playwright refuses to
reuse running servers. Screenshots use Chromium/Linux; inspect intentional visual
changes before updating baselines. The focused two-tab recovery test is
`npm run test:e2e -- save-safety.spec.ts --project=desktop`.

`npm run build` runs the web build and then `scripts/check-web-budget.mjs`. The script
reads Vite's generated manifest and totals gzip bytes for entry JavaScript plus its
static imports, counting shared chunks once. The default limit is **200,000 bytes**;
dynamic route chunks and CSS are outside this initial-JavaScript metric. A workspace-only
web build does not run this root budget check. To inspect another explicit limit after
building, run `node scripts/check-web-budget.mjs 200000`.

## Compression and production images

The production web image serves static files and SPA routes through `Caddy.web`.
The separate production/Traefik gateway proxies API requests through `api-proxy` and
web requests to the static web service. Production secrets, TLS, backup and migration
procedures are in [operations](operations.md).

`Caddy.web` enables static zstd/gzip. The API gateways enable compression only for
public `/api/v1/catalogue/*` and `/api/v1/status/catalogue` responses. Account/private
responses are excluded from that matcher. Verify actual response headers and decoded
bytes, rather than merely checking the config text:

```sh
docker build -f deploy/Caddy.Dockerfile -t unifr-planner-caddy:local-check .
.venv/bin/python scripts/test-response-compression.py --image unifr-planner-caddy:local-check
```

To include the public discovery payload size gate, provide a locally captured JSON
response using `--sample /absolute/path/discovery.json`. The script mounts the current
checkout's three Caddy configs into isolated local disposable containers; it does not
contact or modify production. It checks gzip negotiation, `Vary: Accept-Encoding`,
byte-identical decompression, at least 50% reduction and, with a sample, **less than
1,500,000 compressed bytes**. It also checks the account-path negative control remains
uncompressed. zstd is configured but this script tests gzip only.

The 2026-09-22 local acceptance used this exact existing image and captured fixture:

```sh
.venv/bin/python scripts/test-response-compression.py \
  --image unifr-planner-caddy:fb9acbe53d87f862b638066c97186ecceb2c686d \
  --sample /home/nilsb/Documents/Projects/UniFr_Planner/.superpowers/worktrees/simplicity/.superpowers/discovery-sample.json
```

All three configs produced 963,678 gzip bytes from the 13,770,161-byte sample with
identical decoded content. This verifies local configured responses, not a deployed
release or the current size of the live catalogue.
