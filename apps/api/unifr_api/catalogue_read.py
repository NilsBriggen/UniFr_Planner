"""Read-only catalogue projections and filtering over an immutable SQL generation."""

from datetime import datetime, time, timezone
from typing import Literal, Self
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import Engine, select

from unifr_ingest.models import CatalogueSnapshot, Offering, SyncReport
from .catalogue import head, offerings, snapshots

ZURICH = ZoneInfo("Europe/Zurich")
CLOCK = r"^(?:[01]\d|2[0-3]):[0-5]\d$"


class CatalogueFilters(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    q: str = Field(default="", max_length=200)
    term: str | None = Field(default=None, max_length=40)
    faculty: str | None = Field(default=None, max_length=200)
    language: str | None = Field(default=None, pattern=r"^[a-z]{2}$")
    level: str | None = Field(default=None, max_length=100)
    ects_min: float | None = Field(default=None, ge=0, le=180, allow_inf_nan=False)
    ects_max: float | None = Field(default=None, ge=0, le=180, allow_inf_nan=False)
    available_day: int | None = Field(default=None, ge=0, le=6)
    available_from: str | None = Field(default=None, pattern=CLOCK)
    available_until: str | None = Field(default=None, pattern=CLOCK)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def check_ranges(self) -> Self:
        if (
            self.ects_min is not None
            and self.ects_max is not None
            and self.ects_min > self.ects_max
        ):
            raise ValueError("ECTS minimum must not exceed maximum")
        window = (self.available_day, self.available_from, self.available_until)
        if any(value is not None for value in window):
            if any(value is None for value in window):
                raise ValueError("Availability requires weekday, start and end in Europe/Zurich")
            if self.available_from is not None and self.available_until is not None:
                if self.available_from >= self.available_until:
                    raise ValueError("Availability must end after it starts")
        return self


class CatalogueStatus(BaseModel):
    availability: Literal["available", "unavailable"] = "unavailable"
    reason: Literal["no_published_snapshot", "database_unavailable"] | None = None
    snapshot_id: str | None = None
    published_at: datetime | None = None
    age_seconds: int | None = None
    stale: bool = False
    latest_sync_outcome: str | None = None
    latest_sync_at: datetime | None = None
    development_fixture: bool = False


class PublicOffering(Offering):
    source_url: str
    meeting_state: Literal["resolved", "unresolved"]


class CourseDetail(BaseModel):
    code: str
    titles: dict[str, str]
    offerings: list[PublicOffering]


class CoursePage(BaseModel):
    items: list[CourseDetail]
    total: int
    limit: int
    offset: int
    status: CatalogueStatus


class CatalogueTerms(BaseModel):
    terms: list[str]
    faculties: list[str]
    languages: list[str]
    levels: list[str]
    status: CatalogueStatus


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


def matches(offering: Offering, filters: CatalogueFilters) -> bool:
    haystack = " ".join(
        (
            offering.course.code,
            *offering.course.titles.values(),
            offering.lecturer,
            offering.faculty_domain,
        )
    ).casefold()
    if filters.q.casefold() not in haystack:
        return False
    for selected, values in (
        (filters.term, offering.terms),
        (filters.faculty, (offering.faculty_domain,)),
        (filters.language, offering.languages),
        (filters.level, offering.levels),
    ):
        if selected is not None and selected.casefold() not in {v.casefold() for v in values}:
            return False
    if filters.ects_min is not None and (offering.ects is None or offering.ects < filters.ects_min):
        return False
    if filters.ects_max is not None and (offering.ects is None or offering.ects > filters.ects_max):
        return False
    if filters.available_day is not None:
        if unresolved(offering):
            return False
        for meeting in offering.meetings:
            if meeting.cancelled:
                continue
            assert meeting.starts_at is not None and meeting.ends_at is not None
            start, end = meeting.starts_at.astimezone(ZURICH), meeting.ends_at.astimezone(ZURICH)
            if (
                start.weekday() != filters.available_day
                or start.date() != end.date()
                or start.time() < time.fromisoformat(filters.available_from or "00:00")
                or end.time() > time.fromisoformat(filters.available_until or "00:00")
            ):
                return False
    return True


class CatalogueReadService:
    def __init__(self, engine: Engine) -> None:
        # Resolve the head once, then query immutable rows by ID. A concurrent publication
        # cannot mix course data, provenance and status from different generations.
        with engine.connect() as connection:
            row = connection.execute(
                select(snapshots.c.data, snapshots.c.report).join(
                    head, head.c.snapshot_id == snapshots.c.id
                )
            ).first()
            reports = [
                SyncReport.model_validate(value)
                for value in connection.execute(select(snapshots.c.report)).scalars()
            ]
            self.snapshot: CatalogueSnapshot | None = None
            published = None
            if row:
                data = dict(row[0])
                data["offerings"] = list(
                    connection.execute(
                        select(offerings.c.data).where(
                            offerings.c.snapshot_id == data["snapshot_id"]
                        )
                    ).scalars()
                )
                self.snapshot = CatalogueSnapshot.model_validate(data)
                published = SyncReport.model_validate(row[1])
        latest = max(reports, key=lambda report: report.completed_at, default=None)
        age = (
            max(0, int((datetime.now(timezone.utc) - published.completed_at).total_seconds()))
            if published
            else None
        )
        self.status = CatalogueStatus(
            availability="available" if self.snapshot else "unavailable",
            reason=None if self.snapshot else "no_published_snapshot",
            snapshot_id=self.snapshot.snapshot_id if self.snapshot else None,
            published_at=published.completed_at if published else None,
            age_seconds=age,
            stale=age is not None and age > 48 * 3600,
            latest_sync_outcome=latest.outcome if latest else None,
            latest_sync_at=latest.completed_at if latest else None,
            development_fixture=bool(
                self.snapshot and self.snapshot.snapshot_id.startswith("development-fixture-")
            ),
        )

    def course_list(
        self, filters: CatalogueFilters, *, exact_code: str | None = None
    ) -> CoursePage:
        grouped: dict[str, CourseDetail] = {}
        urls = (
            {
                entry.source_id: entry.detail_url
                for page in self.snapshot.pages
                for entry in page.entries
            }
            if self.snapshot
            else {}
        )
        for offering in self.snapshot.offerings if self.snapshot else ():
            if (exact_code is not None and offering.course.code != exact_code) or not matches(
                offering, filters
            ):
                continue
            code = offering.course.code
            if code not in grouped:
                grouped[code] = CourseDetail(code=code, titles=offering.course.titles, offerings=[])
            grouped[code].offerings.append(
                PublicOffering(
                    **offering.model_dump(),
                    source_url=urls.get(offering.source_id, ""),
                    meeting_state="unresolved" if unresolved(offering) else "resolved",
                )
            )
        values = [grouped[code] for code in sorted(grouped)]
        for course in values:
            course.offerings.sort(key=lambda offering: (offering.terms, offering.source_id))
        return CoursePage(
            items=values[filters.offset : filters.offset + filters.limit],
            total=len(values),
            limit=filters.limit,
            offset=filters.offset,
            status=self.status,
        )

    def course(self, code: str) -> CourseDetail | None:
        # Exact course identity; multiple term offerings are retained, never guessed.
        for course in self.course_list(CatalogueFilters(), exact_code=code).items:
            if course.code == code:
                return course
        return None

    def terms(self) -> CatalogueTerms:
        values = self.snapshot.offerings if self.snapshot else ()
        return CatalogueTerms(
            terms=sorted({term for off in values for term in off.terms}),
            faculties=sorted({off.faculty_domain for off in values if off.faculty_domain}),
            languages=sorted({lang for off in values for lang in off.languages}),
            levels=sorted({level for off in values for level in off.levels}),
            status=self.status,
        )
