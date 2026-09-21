"""Durable Zurich schedules, restricted operational facts and redacted JSON events."""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
import hashlib
import json
import sys
from typing import Any
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import Column, Engine, JSON, String, Table, insert, select, text, update

from .database import metadata

runs = Table(
    "operations_run",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("job", String(32), nullable=False),
    Column("due_at", String(40), nullable=False),
    Column("started_at", String(40), nullable=False),
    Column("finished_at", String(40)),
    Column("outcome", String(32), nullable=False),
    Column("details", JSON, nullable=False),
)
state = Table(
    "operations_state",
    metadata,
    Column("key", String(64), primary_key=True),
    Column("value", JSON, nullable=False),
)


def event(kind: str, **fields: Any) -> None:
    print(json.dumps({"event": kind, **fields}, separators=(",", ":")), file=sys.stderr, flush=True)


def next_due(job: str, now: datetime) -> datetime:
    local = now.astimezone(ZoneInfo("Europe/Zurich"))
    candidate = local.replace(
        hour=5 if job == "catalogue" else 4,
        minute=0 if job == "catalogue" else 30,
        second=0,
        microsecond=0,
    )
    if candidate <= local:
        candidate += timedelta(days=1)
    if job == "documents":
        candidate += timedelta(days=(0 - candidate.weekday()) % 7)
    return candidate.astimezone(timezone.utc)


def put_state(engine: Engine, key: str, value: Any) -> None:
    with engine.begin() as connection:
        if connection.execute(select(state.c.key).where(state.c.key == key)).first():
            connection.execute(update(state).where(state.c.key == key).values(value=value))
        else:
            connection.execute(insert(state).values(key=key, value=value))


def tick(
    engine: Engine,
    now: datetime,
    execute: Callable[[str], dict[str, Any]],
    *,
    allow_sqlite: bool = False,
) -> None:
    """One coordinator owns a tick; importer additionally acquires its existing lock."""
    if engine.dialect.name != "postgresql" and not allow_sqlite:
        raise ValueError("Scheduler requires PostgreSQL locking")
    with engine.connect() as lock:
        postgres = engine.dialect.name == "postgresql"
        if postgres:
            acquired = lock.scalar(text("SELECT pg_try_advisory_lock(854712092)"))
            lock.commit()
            if not acquired:
                raise RuntimeError("Scheduler already active")
        try:
            # A crashed process cannot leave its run looking successful forever.
            with engine.begin() as connection:
                connection.execute(
                    update(runs)
                    .where(runs.c.outcome == "running")
                    .values(
                        outcome="failure",
                        finished_at=now.isoformat(),
                        details={"reason": "interrupted"},
                    )
                )
            for job in ("catalogue", "documents"):
                key = f"next:{job}"
                with engine.connect() as connection:
                    due = connection.scalar(select(state.c.value).where(state.c.key == key))
                if due is None:
                    put_state(engine, key, next_due(job, now).isoformat())
                    continue
                if now < datetime.fromisoformat(due):
                    continue
                identifier = str(uuid4())
                with engine.begin() as connection:
                    connection.execute(
                        insert(runs).values(
                            id=identifier,
                            job=job,
                            due_at=due,
                            started_at=now.isoformat(),
                            outcome="running",
                            details={},
                        )
                    )
                event("job_started", job=job, job_id=identifier, due_at=due)
                try:
                    details = execute(job)
                    outcome = details.get("outcome", "failure")
                    if outcome not in ("success", "rejected", "failure"):
                        outcome = "failure"
                except Exception as error:
                    outcome, details = "failure", {"reason": type(error).__name__}
                with engine.begin() as connection:
                    connection.execute(
                        update(runs)
                        .where(runs.c.id == identifier)
                        .values(
                            outcome=outcome,
                            details=details,
                            finished_at=datetime.now(timezone.utc).isoformat(),
                        )
                    )
                put_state(engine, key, next_due(job, now).isoformat())
                event("job_finished", job=job, job_id=identifier, outcome=outcome)
        finally:
            if postgres:
                lock.execute(text("SELECT pg_advisory_unlock(854712092)"))
                lock.commit()


def catalogue_job(backup: Callable[[], object], synchronize: Callable[[], Any]) -> dict[str, Any]:
    backup()
    report = synchronize()
    return {
        "outcome": "success" if report.published else "rejected",
        "snapshot_id": report.snapshot_id,
        "import_outcome": report.outcome,
    }


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(
        self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str
    ) -> None:
        return None


def fetch_document(url: str) -> bytes:
    if urlsplit(url).scheme != "https":
        raise ValueError("Document sources require HTTPS")
    with build_opener(NoRedirect()).open(url, timeout=30) as response:
        data = response.read(20_000_001)
        if len(data) > 20_000_000 or not data:
            raise ValueError("Invalid document size")
        return bytes(data)


def check_documents(
    documents: list[dict[str, str]], fetch: Callable[[str], bytes] = fetch_document
) -> dict[str, Any]:
    results = []
    for document in documents:
        try:
            digest = hashlib.sha256(fetch(document["url"])).hexdigest()
            status = "unchanged" if digest == document["sha256"] else "changed_review_required"
            results.append({"id": document["id"], "status": status, "sha256": digest})
        except Exception as error:
            results.append(
                {
                    "id": document.get("id", "unknown"),
                    "status": "failure",
                    "reason": type(error).__name__,
                }
            )
    outcome = (
        "failure"
        if not results or any(r["status"] == "failure" for r in results)
        else "rejected"
        if any(r["status"] != "unchanged" for r in results)
        else "success"
    )
    return {"outcome": outcome, "documents": results}


def assess_monitor(
    *,
    free_bytes: int,
    database_bytes: int,
    database_limit: int,
    latest_backup: datetime | None,
    now: datetime | None = None,
    minimum_free: int = 1_073_741_824,
) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    alerts = []
    if free_bytes < minimum_free:
        alerts.append("disk_low")
    if database_bytes > database_limit:
        alerts.append("database_large")
    if latest_backup is None or now - latest_backup > timedelta(hours=26):
        alerts.append("backup_missing_or_stale")
    return {
        "outcome": "failure" if alerts else "success",
        "alerts": alerts,
        "free_bytes": free_bytes,
        "database_bytes": database_bytes,
        "checked_at": now.isoformat(),
    }


def send_alert(url: str, payload: dict[str, Any]) -> str:
    if not url:
        return "disabled"
    parsed = urlsplit(url)
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost")
    ):
        raise ValueError("Alert hook requires HTTPS or local loopback")
    request = Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with build_opener(NoRedirect()).open(request, timeout=10) as response:
            return "delivered" if 200 <= response.status < 300 else "failed"
    except Exception:
        event("alert_delivery_failed")
        return "failed"
