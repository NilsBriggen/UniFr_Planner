#!/usr/bin/env python3
"""Run strict browser acceptance only against this repository's local fixture stack."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.request import HTTPRedirectHandler, ProxyHandler, build_opener
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "http://127.0.0.1:4173"  # Also fixed by the existing browser contexts.
COMPOSE_FILE = ROOT / "compose.production.yaml"
RESET_SQL = """
LOCK TABLE public.catalogue_head, public.catalogue_snapshot IN SHARE MODE;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.catalogue_head AS head
        JOIN public.catalogue_snapshot AS snapshot ON snapshot.id = head.snapshot_id
        WHERE head.id = 1 AND snapshot.id LIKE 'development-fixture-%'
    ) THEN
        RAISE EXCEPTION 'Acceptance reset requires a development fixture in this database';
    END IF;
END $$;
WITH removed AS (DELETE FROM public.account_rate_limit RETURNING 1)
SELECT count(*) FROM removed;
"""


class Refused(Exception):
    """The target could not be proven to be the disposable local fixture."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Refused("Catalogue probe redirected; refusing a different target")


def read_status():
    # Never follow redirects or ambient HTTP proxies away from loopback.
    opener = build_opener(ProxyHandler({}), NoRedirect())
    with opener.open(ORIGIN + "/api/v1/status/catalogue", timeout=10) as response:
        return json.load(response)


def checked(condition, message):
    if not condition:
        raise Refused(message)


def run(envfile: Path, output: Path, *, check_only=False):
    envfile = envfile.resolve(strict=True)
    checked(envfile.is_file(), "An explicit Compose environment file is required")
    environment = os.environ.copy()
    # Compose reads the private token from the explicit file, not an ambient override.
    environment.pop("UNIFR_ADMIN_TOKEN", None)
    environment.pop("UNIFR_RELEASE_KEEP_ACCOUNT", None)
    sha = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout.strip()
    checked(bool(re.fullmatch(r"[0-9a-f]{40}", sha)), "Cannot identify current HEAD")
    environment["RELEASE_ID"] = sha

    def capture(command, *, input=None):
        return subprocess.run(
            command,
            cwd=ROOT,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
            input=input,
        ).stdout

    # A named Docker context can otherwise silently send all checks and writes remotely.
    daemon = environment.get("DOCKER_HOST")
    if not daemon:
        daemon = json.loads(
            capture(["docker", "context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"])
        )
    checked(daemon.startswith("unix://"), "Only a local Unix-socket Docker daemon is allowed")
    # Pin the checked daemon even if an ambient named context was selected.
    environment.pop("DOCKER_CONTEXT", None)
    environment["DOCKER_HOST"] = daemon
    compose = ["docker", "compose", "--env-file", str(envfile), "-f", str(COMPOSE_FILE)]

    def preflight():
        config = json.loads(capture(compose + ["config", "--format", "json"]))
        services = config["services"]
        ports = services["caddy"]["ports"]
        checked(
            all(p.get("host_ip") == "127.0.0.1" for p in ports),
            "Every Caddy published port must bind to 127.0.0.1",
        )
        checked(
            sum(p["target"] == 8080 and str(p["published"]) == "4173" for p in ports) == 1,
            "Browser acceptance requires loopback HTTP port 4173",
        )
        checked(
            services["caddy"]["environment"]["SITE_ADDRESS"] == "http://127.0.0.1:8080",
            "Caddy must serve the local HTTP fixture origin",
        )
        api_env = services["api"]["environment"]
        db_env = services["db"]["environment"]
        database = urlsplit(api_env["UNIFR_DATABASE_URL"])
        database_name = unquote(database.path.removeprefix("/"))
        checked(
            database.scheme in {"postgresql", "postgresql+psycopg"}
            and database.hostname == "db"
            and database.port in {None, 5432}
            and bool(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", database_name))
            and not database.query
            and not database.fragment,
            "API must use the Compose PostgreSQL db service with an explicit database name",
        )
        checked(
            database_name == db_env.get("POSTGRES_DB") and bool(db_env.get("POSTGRES_USER")),
            "API database does not match the configured reset database",
        )
        checked(
            json.loads(api_env["UNIFR_ACCOUNT_ORIGINS"]) == [ORIGIN],
            "Account origin must be exactly the local HTTP browser origin",
        )
        checked(bool(api_env.get("UNIFR_ADMIN_TOKEN")), "An administrator token is required")
        ids = capture(compose + ["ps", "-q", "db", "api", "web", "caddy"]).split()
        checked(len(ids) == 4, "Expected exactly four running db/api/web/caddy containers")
        containers = json.loads(capture(["docker", "inspect", *ids]))
        found = set()
        db_container_id = None
        for container in containers:
            labels = container["Config"]["Labels"]
            service = labels.get("com.docker.compose.service")
            checked(
                service in {"db", "api", "web", "caddy"} and service not in found,
                "Unexpected or duplicate Compose service",
            )
            found.add(service)
            checked(container["State"]["Running"], "A required container is not running")
            checked(
                labels.get("com.docker.compose.project") == config["name"]
                and labels.get("com.docker.compose.project.working_dir") == str(ROOT)
                and labels.get("com.docker.compose.project.config_files") == str(COMPOSE_FILE),
                "Container does not belong to this repository and production Compose file",
            )
            if service != "db":
                checked(
                    labels.get("org.opencontainers.image.revision") == sha,
                    "Deploy current HEAD before running acceptance",
                )
            live_env = dict(value.split("=", 1) for value in container["Config"]["Env"])
            if service == "api":
                checked(
                    all(
                        live_env.get(key) == api_env[key]
                        for key in (
                            "UNIFR_ACCOUNT_ORIGINS",
                            "UNIFR_ADMIN_TOKEN",
                            "UNIFR_DATABASE_URL",
                        )
                    ),
                    "Running API configuration differs from the explicit environment file",
                )
            if service == "db":
                checked(
                    all(
                        live_env.get(key) == db_env[key] for key in ("POSTGRES_DB", "POSTGRES_USER")
                    )
                    and live_env.get("POSTGRES_DB") == database_name,
                    "Running reset database identity differs from the API database",
                )
                db_container_id = container["Id"]
            if service == "caddy":
                checked(
                    live_env.get("SITE_ADDRESS") == "http://127.0.0.1:8080",
                    "Running Caddy origin is not the local HTTP fixture",
                )
                expected_ports = {
                    f"{p['target']}/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(p["published"])}]
                    for p in ports
                }
                checked(
                    container["HostConfig"]["PortBindings"] == expected_ports,
                    "Running Caddy port bindings differ from the validated configuration",
                )
        checked(found == {"db", "api", "web", "caddy"}, "Missing required Compose services")
        status = read_status()
        checked(
            status.get("availability") == "available" and status.get("development_fixture") is True,
            "Routed catalogue must explicitly identify an available development fixture",
        )
        return api_env["UNIFR_ADMIN_TOKEN"], db_container_id

    if check_only:
        preflight()
        print(f"Local fixture checks passed at {sha}; no counters reset or browsers run.")
        return
    for project in ("desktop", "phone"):
        token, db_container_id = preflight()  # Recheck before each reset.
        output.mkdir(parents=True, exist_ok=True)
        # Literal shell program; no host values or credentials are interpolated into it.
        reset = 'exec psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction -qAt -f -'
        # Pin the inspected container, and hold catalogue locks through marker check + delete.
        count = capture(
            ["docker", "exec", "-i", db_container_id, "sh", "-c", reset], input=RESET_SQL
        ).strip()
        checked(count.isdecimal(), "Limiter reset did not return a row count")
        print(f"{project}: removed {count} disposable account_rate_limit rows", flush=True)
        browser_env = {
            **environment,
            "UNIFR_E2E_ADMIN_TOKEN": token,
            "UNIFR_RELEASE_STRICT": "1",
        }
        subprocess.run(
            [
                "npm",
                "run",
                "test:e2e",
                "--",
                "--config=playwright.deployed.config.ts",
                f"--project={project}",
                "--workers=2",
                "--retries=0",
                "--max-failures=1",
                f"--output={output.resolve() / project}",
            ],
            cwd=ROOT,
            env=browser_env,
            check=True,
        )
    print(f"Deployed acceptance passed at {sha}. Artifacts: {output.resolve()}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "env_file", type=Path, help="Explicit local-fixture Compose environment file"
    )
    parser.add_argument(
        "--output", type=Path, help="Directory for separate desktop/phone artifacts"
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Validate target without resetting counters or running tests",
    )
    args = parser.parse_args()
    try:
        output = args.output or Path(tempfile.mkdtemp(prefix="unifr-deployed-acceptance-"))
        run(args.env_file, output, check_only=args.check_only)
    except subprocess.CalledProcessError as error:
        # Captured Compose output can contain credentials; never render it or command bodies.
        print(
            f"Acceptance stopped: external command failed (exit {error.returncode}).",
            file=sys.stderr,
        )
        return error.returncode if 0 < error.returncode < 126 else 1
    except (Refused, OSError, ValueError, KeyError, TypeError) as error:
        message = str(error) if isinstance(error, Refused) else type(error).__name__
        print(f"Acceptance refused: {message}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
