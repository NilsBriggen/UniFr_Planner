# Production operations

The production installation is a single Docker Compose project containing PostgreSQL, a
one-shot migration, the API, the scheduler/monitor, the static web server, and the public Caddy
gateway. `compose.yaml` remains the development stack; use `compose.production.yaml` only with an
explicit protected environment file.

## Secrets, origin and first deployment

Copy the variable names from `deploy/production.env.example` to a root-owned file outside the
checkout, such as `/etc/unifr-planner.env`, and set its mode to `0600`. Use the full deployed Git
commit as `RELEASE_ID`; production images are tagged and labelled with it and their base images are
digest-pinned. Generate independent high-entropy values for `POSTGRES_PASSWORD` and
`UNIFR_ADMIN_TOKEN` (at least 32 characters). Do not reuse a student account password or put either
value in a URL, repository file, shell transcript, or browser storage.

`UNIFR_ACCOUNT_ORIGINS` is a JSON array containing only the exact public HTTPS origin(s).
`SITE_ADDRESS` is the public hostname handled by Caddy, without `http://`; `TLS_EMAIL` is the ACME
contact. Ports 80 and 443 must reach the host for public certificate issuance. The API deliberately
does not trust proxy headers; Caddy removes the standardized `Forwarded` header and supplies its
own `X-Forwarded-*` values. Student sessions remain secure, HTTP-only, strict same-site cookies.

Validate and deploy the exact checkout:

```sh
docker compose --env-file /etc/unifr-planner.env -f compose.production.yaml config -q
docker compose --env-file /etc/unifr-planner.env -f compose.production.yaml build --pull
docker compose --env-file /etc/unifr-planner.env -f compose.production.yaml up -d --wait
docker compose --env-file /etc/unifr-planner.env -f compose.production.yaml ps
```

All long-running application containers use a read-only root filesystem, drop Linux capabilities,
and run non-root. The one-shot volume initializer runs as root only to assign the persistent Caddy,
backup, and scheduler volumes to uid 10001. PostgreSQL uses its official image user. Logs use the
bounded Docker JSON driver (three 10 MiB files per service).

## Schedule and fail-closed catalogue behavior

The scheduler uses `Europe/Zurich` wall time, including daylight-saving changes:

- Catalogue import: every day at 05:00. A verified `pg_dump` is completed first. If the backup
  fails, the importer is not called and the job is recorded as `failure`.
- Source-document review: every Monday at 04:30. `UNIFR_SOURCE_DOCUMENTS` is a JSON list of
  `{"id":"...","url":"https://...","sha256":"..."}` objects. A digest change records
  `changed_review_required` and a `rejected` job; it never re-baselines or rewrites requirements.

Scheduler and importer PostgreSQL advisory locks prevent overlapping coordinators/imports. A run is
written as `running` before execution and finalized as `success`, `rejected`, or `failure`; an
interrupted `running` record becomes `failure` on the next tick. A rejected or incomplete catalogue
crawl never advances `catalogue_head`, so the last complete published catalogue remains visible.
Review the reported/parsed/page counts and source warnings before retrying or changing policy.

An operator can request a durable immediate run through the same path:

```sh
docker compose --env-file /etc/unifr-planner.env -f compose.production.yaml \
  exec scheduler python -m unifr_api.scheduler --once documents
```

The exit status is zero only for `success`; `rejected` and `failure` remain visible in history.

## Backups and recovery

Backups are PostgreSQL custom archives created atomically in the `backups` volume. Each archive has
a SHA-256 sidecar and is fully decompressed by `pg_restore` before publication. Rotation occurs only
after the new daily and weekly restore points are durable, keeping seven daily archives and four ISO
weekly archives. Existing good restore points are never overwritten, and a failed dump or integrity
check does not start catalogue synchronization.

List and verify restore points without printing credentials:

```sh
docker compose --env-file /etc/unifr-planner.env -f compose.production.yaml \
  exec scheduler find /backups -maxdepth 2 -type f -name '*.dump' -print
docker compose --env-file /etc/unifr-planner.env -f compose.production.yaml \
  exec scheduler python -m unifr_api.backups verify \
  --archive /backups/daily/YYYY-MM-DD.dump
```

Restore into a new, empty database rather than overwriting the live database in place:

1. Copy `/etc/unifr-planner.env` to another root-owned `0600` file and change only `POSTGRES_DB` to
   a new recovery database name.
2. Create that empty database with the same owner:

   ```sh
   docker compose --env-file /etc/unifr-planner.env -f compose.production.yaml \
     exec db sh -c 'createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" unifr_recovery'
   ```

3. Restore through the scheduler image, whose PostgreSQL client matches the server major version:

   ```sh
   docker compose --env-file /etc/unifr-planner-recovery.env -f compose.production.yaml \
     run --rm --no-deps scheduler python -m unifr_api.backups restore \
     --archive /backups/daily/YYYY-MM-DD.dump
   ```

4. Compare catalogue head/counts and account-plan counts with the source, then switch the protected
   production env file to the recovery database and recreate API/scheduler only after approval.

The restore command verifies both checksum and archive contents and refuses any target containing a
table, view, materialized view, sequence, foreign table, or partition. Keep the original database
until the recovered service and user choices have been checked.

## Monitoring, alerts and protected status

`/api/ready` checks database readiness. Compose separately health-checks PostgreSQL, API, scheduler
heartbeat, web, and Caddy. Every 30 seconds the scheduler records free bytes on the backup volume,
database size, backup freshness (maximum 26 hours), and its heartbeat. Defaults alert below 1 GiB
free, above 10 GiB database size, or when a daily backup is missing/stale. Tune thresholds with the
two documented byte variables.

Open `/admin`, enter the separate administrator token, and load the no-store operations view. The
token is held only long enough for that request and is immediately cleared; it is not written to
local/session storage. The page shows next runs, monitoring state, alert delivery state, durable job
history, rejected runs, and catalogue validation history. The API returns 503 while the token is
unset/too short and 401 for a mismatch.

Application request/job events are one-line JSON with generated request or job identifiers. They
contain route templates rather than raw URLs and never authorization, cookie, recovery-code,
password, query-string, or operator-token values. Uvicorn access logs are disabled. Caddy and
container lifecycle logs are separate infrastructure records.

Set `UNIFR_ALERT_HOOK` only to an operator-controlled HTTPS endpoint. Redirects are refused; HTTP is
accepted only for loopback positive controls. A delivery failure is recorded and retried while the
condition remains actionable. With no hook, alerts remain visible as `disabled` in the protected
status rather than silently disappearing. Test a new recipient with synthetic payloads before using
it for production; never point local acceptance at a real recipient.

## Verification boundary

Local acceptance can prove image builds, health/readiness, Caddy routing, secure headers, scheduler
records, a real PostgreSQL dump/clean restore, browser workflows, structured logs, and a loopback
alert receiver. It does not prove public DNS propagation, firewall/NAT reachability, ACME issuance,
certificate renewal, or delivery by an external alert provider. Verify those separately on the
owned production hostname and record the exact evidence before calling the public deployment live.
