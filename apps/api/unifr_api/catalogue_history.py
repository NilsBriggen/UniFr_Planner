"""Historical reads only use validated per-semester heads, never current substitutes."""

from datetime import datetime, timezone
from sqlalchemy import select
from .catalogue_archive_schema import archive_terms, archive_discovery
from .catalogue_projection import generations
from .catalogue_read import ArchiveCoverage, CatalogueReadService, CatalogueStatus, CatalogueTerms


def historical_reader(
    service: CatalogueReadService, term: str | None = None
) -> CatalogueReadService:
    statement = select(archive_terms.c.snapshot_id).where(archive_terms.c.snapshot_id.is_not(None))
    if term is not None:
        statement = statement.where(archive_terms.c.term == term)
    with service.engine.connect() as connection:
        ids = tuple(dict.fromkeys(connection.scalars(statement)))
        latest = connection.execute(
            select(generations.c.snapshot_id, generations.c.completed_at)
            .where(generations.c.snapshot_id.in_(ids))
            .order_by(generations.c.completed_at.desc())
            .limit(1)
        ).first()
    # Keep the same pinned metadata object; no redundant current metadata query.
    service.snapshot_ids = ids
    published_at = datetime.fromisoformat(latest.completed_at) if latest else None
    age = (
        max(0, int((datetime.now(timezone.utc) - published_at).total_seconds()))
        if published_at
        else None
    )
    service.status = CatalogueStatus(
        availability="available" if latest else "unavailable",
        reason=None if latest else "archive_not_available",
        snapshot_id=latest.snapshot_id if latest else None,
        published_at=published_at,
        age_seconds=age,
        stale=age is not None and age > 30 * 86400,
        development_fixture=bool(latest and latest.snapshot_id.startswith("development-fixture-")),
    )
    return service


def historical_terms(service: CatalogueReadService) -> CatalogueTerms:
    result = service.terms()
    with service.engine.connect() as connection:
        # Never expose importer errors or progress checkpoints in a public read.
        rows = connection.execute(
            select(
                archive_terms.c.term,
                archive_terms.c.status,
                archive_terms.c.snapshot_id,
                archive_terms.c.checked_at,
            )
        ).all()
        discovery = connection.scalar(
            select(archive_discovery.c.status).where(archive_discovery.c.id == 1)
        )
    states = {
        "pending": "pending",
        "in_progress": "loading",
        "published": "available",
        "failed": "failed",
    }
    result.coverage = [
        ArchiveCoverage.model_validate(
            {
                "term": row.term,
                "status": "available" if row.snapshot_id else states.get(row.status, "unavailable"),
                "snapshot_id": row.snapshot_id,
                "checked_at": row.checked_at,
                "refresh_failed": bool(row.snapshot_id and row.status == "failed"),
            }
        )
        for row in rows
    ]
    result.coverage.sort(key=lambda row: (row.term[3:], row.term[:2] == "AS"), reverse=True)
    result.terms = [row.term for row in result.coverage]
    result.discovery_status = (
        "available"
        if discovery == "available"
        else "failed"
        if discovery == "failed"
        else "pending"
    )
    return result
