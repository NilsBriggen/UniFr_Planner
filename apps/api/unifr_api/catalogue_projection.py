"""Immutable read indexes, built in the same transaction as staged source data."""

import re
from datetime import timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import JSON, Column, Float, ForeignKey, Index, Integer, String, Table, Text, insert
from sqlalchemy.engine import Connection

from unifr_ingest.models import CatalogueSnapshot, Offering, SyncReport
from .database import metadata

ZURICH = ZoneInfo("Europe/Zurich")

generations = Table(
    "catalogue_read_generation",
    metadata,
    Column("snapshot_id", ForeignKey("catalogue_snapshot.id"), primary_key=True),
    Column("completed_at", String, nullable=False),
    Column("outcome", String, nullable=False),
    Column("archive_term", String),
    Column("facets", JSON, nullable=False),
)
Index("ix_catalogue_read_completed", generations.c.completed_at)
projection = Table(
    "catalogue_read_offering",
    metadata,
    Column("snapshot_id", ForeignKey("catalogue_snapshot.id"), primary_key=True),
    Column("source_id", String, primary_key=True),
    Column("course_code", String, nullable=False),
    Column("canonical_code", String, nullable=False),
    Column("search_text", Text, nullable=False),
    Column("faculty", String, nullable=False),
    Column("ects", Float),
    Column("available_day", Integer),
    Column("available_from", Float),
    Column("available_until", Float),
    Column("source_url", Text, nullable=False),
    Column("meeting_state", String, nullable=False),
    Column("compact", JSON, nullable=False),
)
Index("ix_catalogue_read_course", projection.c.snapshot_id, projection.c.course_code)
Index("ix_catalogue_read_canonical", projection.c.snapshot_id, projection.c.canonical_code)
facets = Table(
    "catalogue_read_facet",
    metadata,
    Column("snapshot_id", ForeignKey("catalogue_snapshot.id"), primary_key=True),
    Column("source_id", String, primary_key=True),
    Column("kind", String, primary_key=True),
    Column("value", String, primary_key=True),
)
Index("ix_catalogue_read_facet_value", facets.c.snapshot_id, facets.c.kind, facets.c.value)


def canonical_code(code: str) -> str:
    return re.sub(r"^UE-(?=[A-Z][A-Z0-9]*\.[0-9]+\Z)", "", code)


def unresolved(offering: Offering) -> bool:
    active = [meeting for meeting in offering.meetings if not meeting.cancelled]
    return not active or any(
        meeting.unresolved
        or not meeting.starts_at
        or not meeting.ends_at
        or meeting.recurrence
        or meeting.additional_dates
        for meeting in active
    )


def completed_at(report: SyncReport) -> str:
    return report.completed_at.astimezone(timezone.utc).isoformat()


def stage_projection(
    connection: Connection, snapshot: CatalogueSnapshot, report: SyncReport
) -> None:
    urls = {entry.source_id: entry.detail_url for page in snapshot.pages for entry in page.entries}
    rows: list[dict[str, Any]] = []
    facet_rows: list[dict[str, str]] = []
    all_facets: dict[str, set[str]] = {
        key: set() for key in ("terms", "faculties", "languages", "levels")
    }
    for offering in snapshot.offerings:
        key = {"snapshot_id": snapshot.snapshot_id, "source_id": offering.source_id}
        unknown = unresolved(offering)
        day = None
        start_seconds: list[float] = []
        end_seconds: list[float] = []
        if not unknown:
            valid = True
            for meeting in offering.meetings:
                if meeting.cancelled:
                    continue
                assert meeting.starts_at is not None and meeting.ends_at is not None
                start, end = (
                    meeting.starts_at.astimezone(ZURICH),
                    meeting.ends_at.astimezone(ZURICH),
                )
                if start.date() != end.date() or (day is not None and day != start.weekday()):
                    valid = False
                day = start.weekday()
                start_seconds.append(
                    start.hour * 3600 + start.minute * 60 + start.second + start.microsecond / 1e6
                )
                end_seconds.append(
                    end.hour * 3600 + end.minute * 60 + end.second + end.microsecond / 1e6
                )
            if not valid:
                day = None
        compact = offering.model_dump(mode="json")
        # Keep the existing public shape while excluding bulky raw narrative content.
        for field in ("assessment", "schedule_summary", "recurrence_summary"):
            compact[field] = ""
        rows.append(
            dict(
                **key,
                course_code=offering.course.code,
                canonical_code=canonical_code(offering.course.code),
                search_text=" ".join(
                    (
                        offering.course.code,
                        *offering.course.titles.values(),
                        offering.lecturer,
                        offering.faculty_domain,
                    )
                ).casefold(),
                faculty=offering.faculty_domain.casefold(),
                ects=offering.ects,
                available_day=day,
                available_from=min(start_seconds) if start_seconds else None,
                available_until=max(end_seconds) if end_seconds else None,
                source_url=urls.get(offering.source_id, ""),
                meeting_state="unresolved" if unknown else "resolved",
                compact=compact,
            )
        )
        for kind, values in (
            ("term", offering.terms),
            ("language", offering.languages),
            ("level", offering.levels),
        ):
            facet_rows.extend(
                dict(**key, kind=kind, value=value) for value in {v.casefold() for v in values}
            )
        all_facets["terms"].update(offering.terms)
        all_facets["languages"].update(offering.languages)
        all_facets["levels"].update(offering.levels)
        if offering.faculty_domain:
            all_facets["faculties"].add(offering.faculty_domain)
    connection.execute(
        insert(generations).values(
            snapshot_id=snapshot.snapshot_id,
            completed_at=completed_at(report),
            outcome="staged" if report.published else report.outcome,
            archive_term=report.source_hashes.get("archive_term"),
            facets={key: sorted(values) for key, values in all_facets.items()},
        )
    )
    if rows:
        connection.execute(insert(projection), rows)
    if facet_rows:
        connection.execute(insert(facets), facet_rows)
