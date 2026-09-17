"""Opt-in, isolated catalogue demonstration. Never writes the configured production DB."""

import argparse
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn
from sqlalchemy import create_engine

from unifr_ingest.models import (
    CatalogueSnapshot,
    Course,
    ListingEntry,
    ListingPage,
    Meeting,
    Offering,
    SyncReport,
)
from .catalogue import SqlCatalogueRepository
from .database import metadata


def seed(repository: SqlCatalogueRepository, *, rejected: bool = False) -> None:
    now = datetime.now(timezone.utc)
    identifier = "development-fixture-rejected" if rejected else "development-fixture-catalogue"
    values = []
    entries = []
    for index in range(1, 25) if not rejected else ():
        code, source_id = f"DEMO-{index:03}", f"{990000 + index}"
        titles = (
            {"de": "Algebra", "fr": "Algèbre", "en": "Algebra"}
            if index == 1
            else {"de": "Ökologie", "fr": "Écologie", "en": "Ecology"}
            if index == 2
            else {
                "de": "Forschungsseminar",
                "fr": "Séminaire de recherche",
                "en": "Research seminar",
            }
            if index == 3
            else {"en": f"Example course {index:02}"}
        )
        sessions = (
            (Meeting(unresolved=True, note="Meeting times unpublished"),)
            if index == 3
            else (
                Meeting(
                    starts_at=datetime(2026, 9, 21, 10, tzinfo=timezone.utc),
                    ends_at=datetime(2026, 9, 21, 11, tzinfo=timezone.utc),
                    location="PER 21 · 001",
                ),
            )
        )
        values.append(
            Offering(
                source_id=source_id,
                course=Course(code=code, titles=titles),
                terms=("AS-2026",),
                ects=None if index == 3 else 6 if index != 2 else 9,
                languages=("fr",) if index == 2 else ("de", "en"),
                levels=("Master",) if index == 2 else ("Bachelor",),
                lecturer="Development example",
                faculty_domain="Arts" if index == 2 else "Science",
                schedule_summary="",
                recurrence_summary="",
                meetings=sessions,
                assessment="Example assessment",
                prerequisites="",
                equivalents="",
                assignments=(),
                calendar_url=None,
                listing_fingerprint=code,
                detail_hash=code,
            )
        )
        entries.append(
            ListingEntry(
                source_id=source_id,
                code=code,
                title=titles.get("en", ""),
                terms=("AS-2026",),
                schedule_summary="",
                lecturer="Development example",
                faculty_domain="Science",
                languages=("de",),
                detail_url=f"https://www.unifr.ch/timetable/en/course.html?show={source_id}",
                fingerprint=code,
            )
        )
    snapshot = CatalogueSnapshot(
        snapshot_id=identifier,
        reported_count=3660 if rejected else len(values),
        pages=()
        if rejected
        else (
            ListingPage(
                number=1,
                page_size=24,
                reported_count=24,
                entries=tuple(entries),
                raw_hash="development-fixture",
            ),
        ),
        offerings=tuple(values),
    )
    report = SyncReport(
        snapshot_id=identifier,
        published=not rejected,
        outcome="rejected_due_to_source_change" if rejected else "published",
        reported_count=snapshot.reported_count,
        parsed_count=len(values),
        pages_fetched=1,
        completed_at=now if rejected else now - timedelta(days=3),
    )
    repository.stage(snapshot, report)
    if not rejected:
        with repository.lock():
            repository.publish(snapshot, report)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--rejected", action="store_true")
    args = parser.parse_args()
    with TemporaryDirectory(prefix="unifr-catalogue-demo-") as temporary:
        url = f"sqlite:///{Path(temporary) / 'catalogue.sqlite'}"
        engine = create_engine(url)
        metadata.create_all(engine)
        seed(SqlCatalogueRepository(engine, allow_sqlite=True), rejected=args.rejected)
        engine.dispose()
        os.environ["UNIFR_DATABASE_URL"] = url
        uvicorn.run("unifr_api.main:app", host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
