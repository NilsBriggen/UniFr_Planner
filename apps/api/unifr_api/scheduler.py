"""Production coordinator: backup before 05:00 import, weekly documents, minute monitoring."""

import argparse
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import shutil
from threading import Event, Thread
import time
from typing import Any

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine

from .backups import backup, verify
from .catalogue import SqlCatalogueRepository
from .config import Settings
from .operations import (
    assess_monitor,
    catalogue_job,
    check_documents,
    event,
    put_state,
    runs,
    send_alert,
    state,
    tick,
)
from unifr_ingest.http import HttpCatalogueSource
from unifr_ingest.sync import sync


def healthy(directory: Path) -> bool:
    try:
        at = datetime.fromisoformat(json.loads((directory / "heartbeat.json").read_text())["at"])
        age = (datetime.now(timezone.utc) - at).total_seconds()
        return 0 <= age < 120
    except (OSError, ValueError, KeyError, TypeError):
        return False


def monitor(engine: Engine, settings: Settings) -> dict[str, Any]:
    archives = sorted(settings.backup_dir.glob("daily/*.dump"))
    latest = None
    if archives:
        verify(archives[-1])
        latest = datetime.fromtimestamp(archives[-1].stat().st_mtime, timezone.utc)
    with engine.connect() as connection:
        database_bytes = int(
            connection.scalar(text("SELECT pg_database_size(current_database())")) or 0
        )
    return assess_monitor(
        free_bytes=shutil.disk_usage(settings.backup_dir).free,
        database_bytes=database_bytes,
        database_limit=settings.database_limit_bytes,
        latest_backup=latest,
        minimum_free=settings.disk_minimum_bytes,
    )


def pulse(engine: Engine, settings: Settings, stop: Event) -> None:
    """Independent heartbeat stays alive during long imports and dies on DB failure."""
    while not stop.is_set():
        try:
            result = monitor(engine, settings)
            with engine.connect() as connection:
                prior = connection.scalar(select(state.c.value).where(state.c.key == "monitor"))
                failed = (
                    connection.execute(
                        select(runs)
                        .where(runs.c.outcome.in_(("failure", "rejected")))
                        .order_by(runs.c.started_at.desc())
                        .limit(1)
                    )
                    .mappings()
                    .first()
                )
                notified = connection.scalar(
                    select(state.c.value).where(state.c.key == "last_alerted_job")
                )
            if result["alerts"] and (
                not prior
                or prior.get("alerts") != result["alerts"]
                or prior.get("delivery") == "failed"
            ):
                result["delivery"] = send_alert(
                    settings.alert_hook, {"event": "monitor", "alerts": result["alerts"]}
                )
            elif prior and "delivery" in prior:
                result["delivery"] = prior["delivery"]
            if failed and failed["id"] != notified:
                delivery = send_alert(
                    settings.alert_hook,
                    {
                        "event": "job_failed",
                        "job_id": failed["id"],
                        "job": failed["job"],
                        "outcome": failed["outcome"],
                    },
                )
                put_state(engine, "last_job_alert", {"job_id": failed["id"], "delivery": delivery})
                if delivery != "failed":
                    put_state(engine, "last_alerted_job", failed["id"])
            put_state(engine, "monitor", result)
            at = {"at": datetime.now(timezone.utc).isoformat()}
            put_state(engine, "heartbeat", at)
            temporary = settings.operations_dir / ".heartbeat.json"
            temporary.write_text(json.dumps(at))
            temporary.replace(settings.operations_dir / "heartbeat.json")
        except Exception as error:
            event("monitor_failed", reason=type(error).__name__)
            try:
                put_state(
                    engine,
                    "monitor",
                    {
                        "outcome": "failure",
                        "alerts": ["monitor_failed"],
                        "reason": type(error).__name__,
                    },
                )
            except Exception:
                pass
        stop.wait(30)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--health", action="store_true")
    parser.add_argument(
        "--once",
        choices=("catalogue", "documents"),
        help="Operator run, recorded through the same scheduler",
    )
    args = parser.parse_args()
    settings = Settings()
    if args.health:
        raise SystemExit(0 if healthy(settings.operations_dir) else 1)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    settings.backup_dir.mkdir(parents=True, exist_ok=True)
    settings.operations_dir.mkdir(parents=True, exist_ok=True)
    engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
    stop = Event()
    worker = Thread(target=pulse, args=(engine, settings, stop), daemon=True)
    worker.start()

    def execute(job: str) -> dict[str, Any]:
        if job == "documents":
            return check_documents(settings.source_documents)
        repository = SqlCatalogueRepository(engine)
        return catalogue_job(
            lambda: backup(settings.backup_dir, settings.database_url, datetime.now(timezone.utc)),
            lambda: sync(HttpCatalogueSource(repository), repository),
        )

    try:
        if args.once:
            put_state(engine, f"next:{args.once}", datetime.now(timezone.utc).isoformat())
        while True:
            try:
                tick(engine, datetime.now(timezone.utc), execute)
            except Exception as error:
                event("scheduler_failed", reason=type(error).__name__)
                if args.once:
                    raise SystemExit(2) from None
            if args.once:
                with engine.connect() as connection:
                    outcome = connection.scalar(
                        select(runs.c.outcome)
                        .where(runs.c.job == args.once)
                        .order_by(runs.c.started_at.desc())
                        .limit(1)
                    )
                raise SystemExit(0 if outcome == "success" else 1)
            time.sleep(10)
    finally:
        stop.set()
        worker.join(timeout=15)
        engine.dispose()


if __name__ == "__main__":
    main()
