"""Typed catalogue contracts. No HTTP, database, or application dependencies."""

from datetime import datetime
from typing import Literal, Self
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Record(BaseModel):
    model_config = ConfigDict(frozen=True)


class Course(Record):
    code: str
    titles: dict[str, str]


class ListingEntry(Record):
    source_id: str
    code: str
    title: str
    terms: tuple[str, ...]
    schedule_summary: str
    lecturer: str
    faculty_domain: str
    languages: tuple[str, ...]
    detail_url: str
    fingerprint: str


class ListingPage(Record):
    number: int
    reported_count: int
    page_size: int = 12
    entries: tuple[ListingEntry, ...]
    raw_hash: str

    @property
    def pages(self) -> range:
        return range(1, max(1, (self.reported_count + self.page_size - 1) // self.page_size) + 1)


class Meeting(Record):
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location: str = ""
    unresolved: bool = False
    cancelled: bool = False
    recurrence: str | None = None
    excluded_dates: tuple[str, ...] = ()
    additional_dates: tuple[str, ...] = ()
    recurrence_id: str | None = None
    source_uid: str | None = None
    note: str = ""

    @model_validator(mode="after")
    def require_unresolved_for_missing_time(self) -> Self:
        if not self.unresolved and (self.starts_at is None or self.ends_at is None):
            raise ValueError("A meeting without both timestamps must be unresolved")
        return self


class ProgrammeAssignment(Record):
    programme: str
    version: str
    paths: tuple[str, ...]


class Offering(Record):
    source_id: str
    course: Course
    terms: tuple[str, ...]
    ects: float | None
    languages: tuple[str, ...]
    # Older snapshots remain readable; absent metadata is unknown, never inferred.
    levels: tuple[str, ...] = ()
    lecturer: str
    faculty_domain: str
    schedule_summary: str
    recurrence_summary: str
    meetings: tuple[Meeting, ...]
    assessment: str
    prerequisites: str
    equivalents: str
    assignments: tuple[ProgrammeAssignment, ...]
    calendar_url: str | None
    listing_fingerprint: str
    detail_hash: str
    calendar_hash: str | None = None
    detail_checked_at: datetime | None = None


class CatalogueSnapshot(Record):
    snapshot_id: str
    reported_count: int
    pages: tuple[ListingPage, ...]
    offerings: tuple[Offering, ...]
    errors: tuple[str, ...] = ()
    verified_listing_hash: str | None = None


class SyncReport(Record):
    snapshot_id: str
    published: bool
    outcome: Literal[
        "published", "staged", "rejected_validation", "rejected_due_to_source_change"
    ] = "staged"
    reported_count: int
    parsed_count: int
    pages_fetched: int
    errors: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    added: int = 0
    removed: int = 0
    changed: int = 0
    unresolved: int = 0
    completed_at: datetime
    source_hashes: dict[str, str] = Field(default_factory=dict)
