"""Bounded, resumable historical imports; never writes the current catalogue head.

Integration: import this module into metadata registration. Retention must exclude
``protected_snapshot_ids(connection)`` before counting/removing old snapshots.
Checkpoints live outside snapshot retention and are removed only on publication or
validation failure. API reads use archive_terms.snapshot_id, never checkpoints.
"""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
import time
from typing import Any, Protocol
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import JSON, Column, Connection, ForeignKey, Integer, String, Table, Text
from sqlalchemy import delete, insert, select, update
from sqlalchemy.engine import Engine

from unifr_ingest.models import CatalogueSnapshot, ListingEntry, ListingPage, Offering, SyncReport
from unifr_ingest.parsers import parse_detail
from unifr_ingest.sync import listing_hash, validate

from .catalogue import SqlCatalogueRepository, offerings, snapshots
from .database import metadata

archive_terms = Table(
    "catalogue_archive_term",
    metadata,
    Column("term", String, primary_key=True),
    Column("source_value", String, nullable=False),
    Column("status", String, nullable=False),
    Column("snapshot_id", ForeignKey("catalogue_snapshot.id")),
    Column("checked_at", String),
    Column("next_attempt_at", String),
    Column("failures", Integer, nullable=False),
    Column("error", Text),
    Column("progress", JSON, nullable=False),
)
checkpoints = Table(
    "catalogue_archive_checkpoint",
    metadata,
    Column("term", ForeignKey("catalogue_archive_term.term"), primary_key=True),
    Column("kind", String, primary_key=True),
    Column("ordinal", Integer, primary_key=True),
    Column("data", JSON, nullable=False),
)


class ArchiveSource(Protocol):
    def semesters(self) -> dict[str, str]: ...
    def listing(self, number: int, *, semester: str = "") -> ListingPage: ...
    def detail(self, entry: ListingEntry) -> str: ...


def term_key(term: str) -> tuple[int, int]:
    season, year = term.split("-")
    if season not in ("AS", "SS"):
        raise ValueError("Unknown semester")
    return int(year), 8 if season == "AS" else 2


def is_past(term: str, now: datetime) -> bool:
    local = now.astimezone(ZoneInfo("Europe/Zurich"))
    current = (local.year, 8 if local.month >= 8 else 2)
    if local.month < 2:
        current = (local.year - 1, 8)
    return term_key(term) < current


def protected_snapshot_ids(connection: Connection) -> set[str]:
    return set(
        connection.scalars(
            select(archive_terms.c.snapshot_id).where(archive_terms.c.snapshot_id.is_not(None))
        )
    )


def coverage(engine: Engine) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = [dict(row) for row in connection.execute(select(archive_terms)).mappings()]
    for row in rows:
        row.pop("progress")
    return sorted(rows, key=lambda row: term_key(row["term"]), reverse=True)


class ArchiveRepository:
    """Own term head over the existing immutable snapshot and offering storage."""

    def __init__(self, repository: SqlCatalogueRepository, term: str) -> None:
        self.repository = repository
        self.engine = repository.engine
        self.term = term

    def current(self) -> CatalogueSnapshot | None:
        with self.engine.connect() as connection:
            data = connection.scalar(
                select(snapshots.c.data)
                .join(archive_terms, archive_terms.c.snapshot_id == snapshots.c.id)
                .where(archive_terms.c.term == self.term)
            )
            if data is None:
                return None
            return self.load(connection, data["snapshot_id"])

    def load(self, connection: Connection, identifier: str) -> CatalogueSnapshot:
        data = dict(
            connection.execute(
                select(snapshots.c.data).where(snapshots.c.id == identifier)
            ).scalar_one()
        )
        data["offerings"] = list(
            connection.scalars(
                select(offerings.c.data).where(offerings.c.snapshot_id == identifier)
            )
        )
        return CatalogueSnapshot.model_validate(data)

    def publish(self, snapshot: CatalogueSnapshot, report: SyncReport) -> None:
        if not self.repository.locked:
            raise RuntimeError("Archive publication requires the catalogue lock")
        errors, _ = validate(snapshot, self.current())
        if (
            errors
            or not report.published
            or report.snapshot_id != snapshot.snapshot_id
            or snapshot.verified_listing_hash != listing_hash(snapshot.pages)
            or any(self.term not in off.terms for off in snapshot.offerings)
        ):
            raise ValueError("Invalid archive publication: " + "; ".join(errors))
        with self.engine.begin() as connection:
            status = connection.scalar(
                select(snapshots.c.status).where(snapshots.c.id == snapshot.snapshot_id)
            )
            stored = self.load(connection, snapshot.snapshot_id)
            if (
                status != "staged"
                or stored.model_dump(exclude={"offerings"})
                != snapshot.model_dump(exclude={"offerings"})
                or {o.source_id: o for o in stored.offerings}
                != {o.source_id: o for o in snapshot.offerings}
            ):
                raise ValueError("Archive publication differs from staged data")
            connection.execute(
                update(snapshots)
                .where(snapshots.c.id == snapshot.snapshot_id)
                .values(status="published", report=report.model_dump(mode="json"))
            )
            connection.execute(
                update(archive_terms)
                .where(archive_terms.c.term == self.term)
                .values(
                    snapshot_id=snapshot.snapshot_id,
                    status="published",
                    checked_at=report.completed_at.isoformat(),
                    next_attempt_at=(report.completed_at + timedelta(days=30)).isoformat(),
                    failures=0,
                    error=None,
                    progress={},
                )
            )
            connection.execute(delete(checkpoints).where(checkpoints.c.term == self.term))


def discover(repository: SqlCatalogueRepository, source: ArchiveSource, now: datetime) -> None:
    """The source caches valid discovery for a day; existing heads survive missing options."""
    advertised = source.semesters()
    if not advertised:
        raise ValueError("Empty semester discovery")
    with repository.engine.begin() as connection:
        known = {r.term: r.source_value for r in connection.execute(select(archive_terms))}
        for term, value in advertised.items():
            if not is_past(term, now):
                continue
            if term not in known:
                connection.execute(
                    insert(archive_terms).values(
                        term=term, source_value=value, status="pending", failures=0, progress={}
                    )
                )
            elif known[term] != value:
                # A selector remap invalidates partial progress, never a published head.
                connection.execute(delete(checkpoints).where(checkpoints.c.term == term))
                connection.execute(
                    update(archive_terms)
                    .where(archive_terms.c.term == term)
                    .values(source_value=value, progress={}, next_attempt_at=None, status="pending")
                )


def _save(
    repository: SqlCatalogueRepository,
    term: str,
    progress: dict[str, Any],
    checkpoint: tuple[str, int, dict[str, Any]] | None = None,
) -> None:
    with repository.engine.begin() as connection:
        if checkpoint:
            kind, ordinal, data = checkpoint
            connection.execute(
                delete(checkpoints).where(
                    checkpoints.c.term == term,
                    checkpoints.c.kind == kind,
                    checkpoints.c.ordinal == ordinal,
                )
            )
            connection.execute(
                insert(checkpoints).values(term=term, kind=kind, ordinal=ordinal, data=data)
            )
        connection.execute(
            update(archive_terms)
            .where(archive_terms.c.term == term)
            .values(progress=progress, status="in_progress", error=None)
        )


def _records(repository: SqlCatalogueRepository, term: str, kind: str) -> list[dict[str, Any]]:
    with repository.engine.connect() as connection:
        return list(
            connection.scalars(
                select(checkpoints.c.data)
                .where(checkpoints.c.term == term, checkpoints.c.kind == kind)
                .order_by(checkpoints.c.ordinal)
            )
        )


def _step(
    repository: SqlCatalogueRepository, source: ArchiveSource, row: dict[str, Any], now: datetime
) -> None:
    term = row["term"]
    progress = dict(row["progress"]) or {"stage": "listing", "cursor": 1, "count": 0}
    stage, cursor = progress["stage"], progress["cursor"]
    if stage == "listing":
        page = source.listing(cursor, semester=row["source_value"])
        if page.number != cursor or page.reported_count < 0:
            raise ValueError("Invalid listing page")
        if any(term not in entry.terms for entry in page.entries):
            raise ValueError("Listing escaped requested semester")
        if cursor > 1 and page.page_size != progress["page_size"]:
            raise ValueError("Pagination changed during archive crawl")
        progress.update(
            count=max(progress["count"], page.reported_count),
            page_size=page.page_size,
            cursor=cursor + 1,
        )
        if cursor * page.page_size >= progress["count"]:
            progress.update(stage="details", cursor=0)
        _save(repository, term, progress, ("listing", cursor, page.model_dump(mode="json")))
        return
    pages = [ListingPage.model_validate(data) for data in _records(repository, term, "listing")]
    entries = [entry for page in pages for entry in page.entries]
    if len(entries) != progress["count"] or len({e.source_id for e in entries}) != len(entries):
        raise ValueError("Incomplete listing or duplicate source IDs")
    if stage == "details" and cursor < len(entries):
        offering = parse_detail(source.detail(entries[cursor]), entries[cursor]).model_copy(
            update={"detail_checked_at": now}
        )
        if term not in offering.terms:
            raise ValueError("Detail escaped requested semester")
        progress["cursor"] = cursor + 1
        if progress["cursor"] == len(entries):
            progress.update(stage="recheck", cursor=1)
        _save(repository, term, progress, ("detail", cursor, offering.model_dump(mode="json")))
        return
    if stage == "details":  # Valid explicit zero-result listing still gets a full recheck.
        progress.update(stage="recheck", cursor=1)
        _save(repository, term, progress)
        return
    if stage == "recheck":
        page = source.listing(cursor, semester=row["source_value"])
        if listing_hash([page]) != listing_hash([pages[cursor - 1]]):
            raise ValueError("Pagination changed during archive crawl (full index recheck)")
        progress["cursor"] += 1
        if cursor == len(pages):
            progress.update(stage="publish", cursor=0)
        _save(repository, term, progress, ("recheck", cursor, page.model_dump(mode="json")))
        return
    values = tuple(Offering.model_validate(data) for data in _records(repository, term, "detail"))
    final = [ListingPage.model_validate(data) for data in _records(repository, term, "recheck")]
    if listing_hash(final) != listing_hash(pages):
        raise ValueError("Incomplete archive recheck")
    snapshot = CatalogueSnapshot(
        snapshot_id=str(uuid4()),
        reported_count=progress["count"],
        pages=tuple(pages),
        offerings=values,
        verified_listing_hash=listing_hash(final),
    )
    adapter = ArchiveRepository(repository, term)
    errors, warnings = validate(snapshot, adapter.current())
    if errors:
        raise ValueError("; ".join(errors))
    report = SyncReport(
        snapshot_id=snapshot.snapshot_id,
        published=True,
        outcome="published",
        reported_count=snapshot.reported_count,
        parsed_count=len(values),
        pages_fetched=len(pages),
        warnings=tuple(warnings),
        completed_at=now,
        source_hashes={"archive_term": term, **{f"page:{p.number}": p.raw_hash for p in pages}},
    )
    repository.stage(snapshot, report)
    adapter.publish(snapshot, report)


def run_slice(
    repository: SqlCatalogueRepository,
    source: ArchiveSource,
    *,
    now: datetime | None = None,
    max_steps: int = 20,
    max_seconds: float = 10,
    current_due: Callable[[], bool] = lambda: False,
) -> dict[str, Any]:
    """At most max_steps stage operations; yield between operations for current jobs.

    max_seconds is a soft limit: a single HTTP operation retains the adapter's bounded
    retries/timeouts. Scheduler's priority callback reserves two minutes before due.
    Discovery runs on first use and once daily via a persistent source cache. Term
    failures retain heads, clear invalid partial work, and back off independently.
    """
    now = now or datetime.now(timezone.utc)
    if max_steps < 1 or max_seconds <= 0:
        raise ValueError("Archive slice budget must be positive")
    if current_due():
        return {"outcome": "yielded", "steps": 0}
    started = time.monotonic()
    steps = 0
    with repository.lock():
        # Discovery timestamp uses the durable source cache so restarts also obey it.
        from unifr_ingest.http import CachedResponse

        discovery = repository.cache_get("archive-semester-discovery")
        if discovery is None or now.timestamp() - discovery.fetched_at >= 86400:
            try:
                discover(repository, source, now)
                repository.cache_put(
                    "archive-semester-discovery",
                    CachedResponse(body="ok", fetched_at=now.timestamp()),
                )
            except (ValueError, OSError, KeyError) as error:
                # Retry discovery in one hour, while already-discovered terms continue.
                repository.cache_put(
                    "archive-semester-discovery",
                    CachedResponse(
                        body=f"{type(error).__name__}: {error}", fetched_at=now.timestamp() - 82800
                    ),
                )
        while steps < max_steps and time.monotonic() - started < max_seconds:
            if current_due():
                return {"outcome": "yielded", "steps": steps}
            with repository.engine.connect() as connection:
                candidates = [
                    dict(row)
                    for row in connection.execute(select(archive_terms)).mappings()
                    if not row["next_attempt_at"]
                    or datetime.fromisoformat(row["next_attempt_at"]) <= now
                ]
            if not candidates:
                break
            row = max(candidates, key=lambda item: term_key(item["term"]))
            try:
                _step(repository, source, row, now)
            except (ValueError, OSError, KeyError) as error:
                failures = min(row["failures"] + 1, 8)
                with repository.engine.begin() as connection:
                    # Transport failures retain valid progress; validation failures restart.
                    progress = row["progress"] if isinstance(error, OSError) else {}
                    if not progress:
                        connection.execute(
                            delete(checkpoints).where(checkpoints.c.term == row["term"])
                        )
                    connection.execute(
                        update(archive_terms)
                        .where(archive_terms.c.term == row["term"])
                        .values(
                            status="failed",
                            error=f"{type(error).__name__}: {error}"[:2000],
                            failures=failures,
                            progress=progress,
                            next_attempt_at=(
                                now + timedelta(minutes=min(15 * 2 ** (failures - 1), 1440))
                            ).isoformat(),
                        )
                    )
            steps += 1
    return {"outcome": "idle" if not steps else "progress", "steps": steps}
