# Foundation development

Use Node 24 (`.node-version`), npm 11.6.0, Python 3.13, and uv 0.11.23.
Exact dependencies are recorded in `package-lock.json` and `uv.lock`.

```sh
npm ci
uv sync --frozen
docker compose up --build
```

Open http://localhost:5173. Compose starts PostgreSQL, runs Alembic before the API,
and waits for database readiness. Its credentials and loopback bindings are for
local development. `docker compose down` retains the database volume; do not add
`--volumes` unless you intend to delete local data.
If a default port is occupied, set `DB_PORT`, `API_PORT`, or `WEB_PORT` for Compose.

To run processes outside Docker, start PostgreSQL separately and set
`UNIFR_DATABASE_URL` (see `.env.example`). Then run:

```sh
uv run alembic upgrade head
PYTHONPATH=apps/api:packages/domain/src:packages/ingest/src uv run uvicorn unifr_api.main:app --reload
npm run dev
```

The web client proxies `/api` to port 8000. `/api/health` is process liveness;
`/api/ready` attempts a bounded database connection and returns 503 on failure.
The baseline migration intentionally only establishes Alembic history. Catalogue
and plan schemas are introduced by later tasks, with metadata in the API adapter.

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npx playwright install chromium
npm run test:e2e -- --project=desktop
npm run test:e2e -- --project=phone
uv run pytest
uv run ruff check apps/api packages
uv run ruff format --check apps/api packages
uv run mypy
```

On Node 26, run unit tests with `NODE_OPTIONS=--no-experimental-webstorage`
because Node's experimental storage globals conflict with jsdom. CI uses Node 24.
Browser visual baselines are Chromium/Linux screenshots; review intentional changes
before the corresponding device run with `--update-snapshots`.

Run browser projects separately so each gets a fresh disposable account backend and
authentication rate-limit budget. Set `E2E_PORT=4183` if port 4173 is occupied. Browser
checks start their own servers and refuse to reuse a running deployment.

For a production static image, build `apps/web/Dockerfile` target `production`.
It serves SPA routes and proxies `/api/*` to an API service named `api`.
The API Dockerfile is also runnable without the development bind mounts or reload.
An operator must supply deployment secrets, TLS termination, backups and an explicit
migration step before exposing a deployment. The foundation contains no accounts,
administrative API, catalogue or planning persistence yet.

`packages/domain` is Python-only business logic, independent of IO adapters;
`packages/ingest` owns source adapters and ingestion work. The logo in
`apps/web/public/unifr-logo.png` is an unchanged copy of the supplied brand input.
