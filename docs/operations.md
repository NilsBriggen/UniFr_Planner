# Production operations

## Existing briggen.dev server

This host already uses Traefik for HTTPS. Deploy UniFr Planner as a separate project under
`/opt/unifr-planner`, with its protected environment at `/etc/unifr-planner.env`. Add
`compose.traefik.yaml` after the production file:

```sh
docker compose --env-file /etc/unifr-planner.env \
  -f compose.production.yaml -f compose.traefik.yaml config -q
docker compose --env-file /etc/unifr-planner.env \
  -f compose.production.yaml -f compose.traefik.yaml up -d --build --wait
```

Set `PUBLIC_HOST=unifr.briggen.dev`, `UNIFR_ACCOUNT_ORIGINS=["https://unifr.briggen.dev"]`,
and `SITE_ADDRESS=unifr.briggen.dev`. The existing Traefik `letsencrypt` resolver owns certificate
issuance. Inspect its current `proxy` network IPv4 address and set `TRAEFIK_IP` to that exact
address before deployment. Never copy a remembered container IP without inspecting it.

The override publishes no host ports. Only the gateway joins the external `proxy` network;
database, API, and web stay on the project's internal networks. `Caddy.traefik` rejects all peers
except that exact Traefik address. It reads client addresses from the right of the forwarded
chain, strips `Forwarded`, and supplies one resolved client address and HTTPS scheme to the API.
Uvicorn still trusts only the project's Caddy address. If Traefik is recreated with a different
IP, update `TRAEFIK_IP` and recreate Caddy; the old address fails closed until corrected.

Use a Git archive of the committed revision and immutable image tags for releases. Keep the
previous release directory and protected environment backup for rollback. Take a verified database
backup before upgrading an existing installation. Do not copy local acceptance accounts or demo
catalogue rows into the server. On a new database request an initial catalogue run through the
scheduler; subsequent runs are at 05:00 Zurich. Catalogue availability depends on the complete
public source crawl passing validation. Guest planning,
manual completed-course entry, programme evaluation, and optional accounts remain available while
the first catalogue is loading.

Verify the public `/api/health` and `/api/ready`, HTTPS certificate, fresh-browser plan creation,
account sync, and all service health checks after deployment. Keep production smoke accounts
separate and delete only the specific account created by the smoke test. Never use the disposable
fixture acceptance runner against the public deployment.

The proxy regression control runs the shipped configuration in isolated Docker containers and
checks independent client addresses, forged forwarding chains, HTTPS forwarding, and refusal of
untrusted peers. Run it with an already built API/Caddy revision:

```sh
uv run python scripts/test-traefik-boundary.py --release <built-git-revision>
```

Run this separately from browser tests, because Docker network changes can interrupt Chromium.

The production installation is a single Docker Compose project containing PostgreSQL, a
one-shot migration, the API, the scheduler/monitor, the static web server, and the public Caddy
gateway. `compose.yaml` remains the development stack; use `compose.production.yaml` only with an
explicit protected environment file.

## Secrets, origin and first deployment

Copy the variable names from `deploy/production.env.example` to a root-owned file outside the
checkout, such as `/etc/unifr-planner.env`, and set its mode to `0600`. Use the full deployed Git
commit as `RELEASE_ID`; production images are tagged and labelled with it and their base images are
digest-pinned. Generate independent high-entropy hexadecimal values for `POSTGRES_PASSWORD`,
`API_DB_PASSWORD`, `SCHEDULER_DB_PASSWORD`, and `UNIFR_ADMIN_TOKEN` (at least 32 characters).
Hexadecimal passwords can be interpolated safely into the internal connection URLs. Do not reuse
a student account password or print populated connection URLs or credentials in a shell transcript.

`UNIFR_ACCOUNT_ORIGINS` is a JSON array containing only the exact public HTTPS origin(s).
`SITE_ADDRESS` is the public hostname handled by Caddy, without `http://`; `TLS_EMAIL` is the ACME
contact. Ports 80 and 443 must reach the host for public certificate issuance. Caddy overwrites
`X-Forwarded-For` with its socket peer and `X-Forwarded-Proto` with the actual scheme and removes
`Forwarded`. Uvicorn trusts only Caddy's fixed `172.30.85.2` address on the dedicated internal
`172.30.85.0/29` proxy network. Only Caddy and API attach to that network; Caddy uses its unique
`api-proxy` alias. API has no published port. Other peers' forwarding headers are ignored, keeping
account IP limits distinct without allowing header spoofing. Reserve that subnet on the host; if
it conflicts, change the subnet, Caddy address, and exact Uvicorn trust address together and rerun
the boundary tests. Do not put another proxy in front without separately designing its trust
boundary. Student sessions remain secure, HTTP-only, strict same-site cookies.

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

The PostgreSQL bootstrap credential exists only in the database and one-shot `migrate` service.
That service runs Alembic as the object owner and then provisions the two independent runtime
roles transactionally and idempotently. `unifr_api` can read application tables and perform DML
on account tables. `unifr_scheduler` can read all application tables for complete backups and
perform DML on catalogue/operations tables. Neither role owns objects, inherits roles, creates
databases/roles/tables/temporary tables, bypasses RLS, or replicates. Schema CREATE and database
PUBLIC privileges are revoked. Existing privileged or object-owning runtime names fail closed
instead of being silently repurposed. Re-running `migrate` refreshes explicit grants after each
migration and safely rotates runtime passwords; recreate runtime containers after changing them.
Runtime services never receive the bootstrap password. Keep that protected environment file and
its credentials available for disaster recovery; database archives omit role definitions.

## Schedule and fail-closed catalogue behavior

The scheduler uses `Europe/Zurich` wall time, including daylight-saving changes:

- Catalogue import: immediately on a fresh installation, then every day at 05:00. A verified `pg_dump` is completed first. If the backup
  fails, the importer is not called and the job is recorded as `failure`.
- Failed/rejected catalogue runs automatically retry after 15 minutes, then one hour, then
  every four hours, without delaying the next regular daily run. Successful runs reset this
  durable backoff. Retry times are calculated from completion, including long-running imports.
  Transient document-check failures retry too; a detected document change retains the weekly
  review cadence and is never silently accepted.
- Source-document review: every Monday at 04:30. `UNIFR_SOURCE_DOCUMENTS` is a JSON list of
  `{"id":"...","url":"https://...","sha256":"..."}` objects. A digest change records
  `changed_review_required` and a `rejected` job; it never re-baselines or rewrites requirements.
  The production CS PDF monitoring baseline is versioned in
  `data/programmes/source-monitor.json`; use its `documents` array when provisioning the server.
  These September 21 byte hashes establish monitoring from that date, not certification of
  encoded curriculum rules. BI source ambiguities and new curriculum/cohort rules still require
  review; timetable imports do not invent degree requirements.

Scheduler and importer PostgreSQL advisory locks prevent overlapping coordinators/imports. A run is
written as `running` before execution and finalized as `success`, `rejected`, or `failure`; an
interrupted `running` record becomes `failure` on the next tick. A rejected or incomplete catalogue
crawl never advances `catalogue_head`, so the last complete published catalogue remains visible.
Review the reported/parsed/page counts and source warnings before retrying or changing policy.
Independent upstream page caches may display different totals. Publication still requires exact
unique-ID coverage of the largest total and an unchanged second pass of the entire index; this
reconciliation is retained as a warning in the import report.

After backed-up imports, old catalogue generations and unused raw caches rotate automatically
(seven published generations, three rejected/staged per status, 30-day unused caches). The current
published generation, saved student plans and their change notices are protected. This bounds
routine importer storage without deleting user history.

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

3. Restore through the migration service with the bootstrap credential. Runtime roles deliberately
   cannot create the restored objects. Its backup volume is mounted read-only:

   ```sh
   docker compose --env-file /etc/unifr-planner-recovery.env -f compose.production.yaml \
     run --rm --no-deps migrate python -m unifr_api.backups restore \
     --archive /backups/daily/YYYY-MM-DD.dump
   ```

4. Run `docker compose --env-file /etc/unifr-planner-recovery.env -f compose.production.yaml
   run --rm --no-deps migrate` to apply any pending migration and grant the runtime roles access
   to restored objects (the archive intentionally excludes ACLs).
5. Compare canonical content digests and identities of the account plans and published catalogue,
   then reopen the recovered plan through the application connected to the recovered database.
   Switch the protected production env file to the recovery database and recreate API/scheduler
   after checking recovery; preserve the source database until this succeeds.

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

Monitor exceptions (including unreadable/corrupt backups and unavailable PostgreSQL) attempt the
hook before persisting their failure record. Only the exception class is transmitted. Each
delivery has a 10-second timeout; failed exception deliveries retry at most every 30 seconds,
and delivered/disabled failures deduplicate for five minutes in memory. A changed failure class,
recovery followed by failure, or process restart triggers a fresh attempt. Heartbeat is not
refreshed on failure, so container health also becomes unhealthy if the database stays unavailable.

## Verification boundary

For the **disposable local fixture stack**, use the guarded deployed browser runner:

```bash
python scripts/run-deployed-acceptance.py /absolute/path/to/local-acceptance.env --check-only
python scripts/run-deployed-acceptance.py /absolute/path/to/local-acceptance.env
python scripts/test_deployed_acceptance.py
```

The environment file must select `HTTP_BIND=127.0.0.1`, `HTTP_PORT=4173`,
`HTTPS_BIND=127.0.0.1`, `SITE_ADDRESS=http://127.0.0.1:8080`, and
`UNIFR_ACCOUNT_ORIGINS=["http://127.0.0.1:4173"]`. Keep its administrator token private;
the runner reads it through Compose without printing it. All running API, web, and Caddy images
must identify the current Git HEAD. The runner overrides `RELEASE_ID` with that HEAD for inspection
and execution; it never builds or recreates services.

Before any counter reset, the runner verifies a local Docker daemon, loopback-only published
Caddy ports, the actual containers' Compose project/repository/file labels, matching live
configuration, and a routed available catalogue with `development_fixture=true`. It refuses
unverified targets, redirects, non-fixture catalogues, and public deployments. `--check-only`
performs those checks without resetting counters or starting browser tests. Run it exclusively
against disposable acceptance data and without another acceptance process sharing the stack.

The database binding is also checked: the expected API URL must name the Compose PostgreSQL
`db` service on port 5432 with an explicit database and no connection-query overrides. The live
API URL must match it exactly, and the inspected database container's `POSTGRES_DB` and
`POSTGRES_USER` must match Compose. The API's database name must equal that exact reset database;
its restricted runtime username need not equal the bootstrap user. A mismatch refuses both
check-only and execution modes. Resets pin the inspected container ID rather than looking up a
possibly replaced service again. Database names must use letters, numbers, underscores, or
hyphens and begin with a letter or underscore, so `psql` cannot reinterpret them as connection
options. The reset connects explicitly to that container's local PostgreSQL socket on port 5432.

The complete suite currently performs 34 credential operations from Docker's shared client address,
exceeding the unchanged security limit of 30 per address per 15 minutes. Therefore the runner
executes every desktop test and then every phone test with two workers and no retries. Before
each project, it rechecks the target and deletes **only `account_rate_limit` rows**, reporting the
row count. In the same PostgreSQL transaction, before deletion, it locks `catalogue_head` and
`catalogue_snapshot` against concurrent changes and requires current head 1 to join a snapshot
whose ID starts with `development-fixture-`. An absent or changed marker aborts the transaction
without deleting rows, even if the earlier HTTP probe passed. Account, plan, and catalogue
records are not reset. This preserves real rate limits,
proxy trust, and browser assertions while isolating the two projects' credential budgets. A
failed check or browser test stops the run with a nonzero exit status; no later reset masks the
failure. Artifacts are kept separately by project in a printed temporary directory, or at the
explicit `--output /absolute/path` destination. Both projects must pass for acceptance.

Local acceptance can prove image builds, health/readiness, Caddy routing, secure headers, scheduler
records, a real PostgreSQL dump/clean restore, browser workflows, structured logs, and a loopback
alert receiver. It does not prove public DNS propagation, firewall/NAT reachability, ACME issuance,
certificate renewal, or delivery by an external alert provider. Verify those separately on the
owned production hostname and record the exact evidence before calling the public deployment live.


## Shared plan storage

Migration `0005_sharing` adds `sharing_plan` and `sharing_rate_limit`. Run the
normal provisioning command before the API is started; it applies the migration
and grants API read/write access plus scheduler read access for backups. Existing
PostgreSQL backups include these tables. Account deletion also removes shares
created under that account; revoked guest links retain a tombstone and no plan
snapshot, preventing accidental link reuse.

The `/api/v1/shares` routes use the same exact-origin write policy as account
routes. Configure the public application origin in `UNIFR_ACCOUNT_ORIGINS`.
Responses are uncached and validation errors do not echo snapshots or secrets.
Creation is limited to 10 requests per client per minute and writes to 120;
these budgets are separate from account sign-in limits. Public reading requires
an unguessable link. Ownership is enforced by the API, never by hidden controls
alone. Link contents are intentionally readable by anyone with the link.

Weekly Excel and print exports are generated in the browser. They require no
additional server process or document service.
