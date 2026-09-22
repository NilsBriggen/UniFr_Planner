"""Read-only catalogue projections and filtering over an immutable SQL generation."""

from collections import OrderedDict
from datetime import datetime, time, timezone
from threading import RLock
from weakref import WeakKeyDictionary
from typing import Literal, Self
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import Engine, and_, func, select
from sqlalchemy.engine import Connection
from sqlalchemy.sql.elements import ColumnElement

from unifr_ingest.models import Offering
from .catalogue import head, offerings
from .catalogue_projection import canonical_code, facets, generations, projection, unresolved

ZURICH = ZoneInfo("Europe/Zurich")
CLOCK = r"^(?:[01]\d|2[0-3]):[0-5]\d$"


class CatalogueFilters(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    q: str = Field(default="", max_length=200)
    codes: str | None = Field(default=None, max_length=10000)
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
        if self.codes is not None:
            codes = [code.strip() for code in self.codes.split(",")]
            if len(codes) > 100 or any(not code or len(code) > 100 for code in codes):
                raise ValueError("codes must contain 1 to 100 nonempty exact course codes")
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
    snapshot_id: str
    parser_revision: int = Field(default=0, exclude=True)
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


class CatalogueDiscovery(BaseModel):
    items: list[CourseDetail]
    status: CatalogueStatus


class CatalogueTerms(BaseModel):
    terms: list[str]
    faculties: list[str]
    languages: list[str]
    levels: list[str]
    status: CatalogueStatus


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


# Cache identity includes the Engine object, never merely a database URL: isolated
# in-memory/test databases and separate PostgreSQL search paths cannot share data.
_discovery_cache: WeakKeyDictionary[Engine, OrderedDict[tuple[object, ...], list[CourseDetail]]] = (
    WeakKeyDictionary()
)
_cache_lock = RLock()


class CatalogueReadService:
    def __init__(self, engine: Engine, *, snapshot_ids: tuple[str, ...] | None = None) -> None:
        self.engine = engine
        with engine.connect() as connection:
            published = connection.execute(
                select(generations.c.snapshot_id, generations.c.completed_at).join(
                    head, head.c.snapshot_id == generations.c.snapshot_id
                )
            ).first()
            latest = connection.execute(
                select(generations.c.outcome, generations.c.completed_at)
                .where(generations.c.archive_term.is_(None))
                .order_by(generations.c.completed_at.desc(), generations.c.snapshot_id.desc())
                .limit(1)
            ).first()
        published_at = datetime.fromisoformat(published.completed_at) if published else None
        age = (
            max(0, int((datetime.now(timezone.utc) - published_at).total_seconds()))
            if published_at
            else None
        )
        self.snapshot_ids = (
            snapshot_ids
            if snapshot_ids is not None
            else ((published.snapshot_id,) if published else ())
        )
        self.status = CatalogueStatus(
            availability="available" if published else "unavailable",
            reason=None if published else "no_published_snapshot",
            snapshot_id=published.snapshot_id if published else None,
            published_at=published_at,
            age_seconds=age,
            stale=age is not None and age > 48 * 3600,
            latest_sync_outcome=latest.outcome if latest else None,
            latest_sync_at=datetime.fromisoformat(latest.completed_at) if latest else None,
            development_fixture=bool(
                published and published.snapshot_id.startswith("development-fixture-")
            ),
        )

    def _conditions(
        self, filters: CatalogueFilters, exact_code: str | None = None
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [projection.c.snapshot_id.in_(self.snapshot_ids)]
        if filters.q:
            conditions.append(
                projection.c.search_text.contains(filters.q.casefold(), autoescape=True)
            )
        if exact_code is not None:
            conditions.append(projection.c.course_code == exact_code)
        if filters.codes is not None:
            conditions.append(
                projection.c.canonical_code.in_(
                    [canonical_code(code.strip()) for code in filters.codes.split(",")]
                )
            )
        if filters.faculty is not None:
            conditions.append(projection.c.faculty == filters.faculty.casefold())
        for kind, selected in (
            ("term", filters.term),
            ("language", filters.language),
            ("level", filters.level),
        ):
            if selected is not None:
                conditions.append(
                    select(facets.c.source_id)
                    .where(
                        facets.c.snapshot_id == projection.c.snapshot_id,
                        facets.c.source_id == projection.c.source_id,
                        facets.c.kind == kind,
                        facets.c.value == selected.casefold(),
                    )
                    .exists()
                )
        if filters.ects_min is not None:
            conditions.append(projection.c.ects >= filters.ects_min)
        if filters.ects_max is not None:
            conditions.append(projection.c.ects <= filters.ects_max)
        if filters.available_day is not None:

            def seconds(value: str) -> int:
                hours, minutes = map(int, value.split(":"))
                return hours * 3600 + minutes * 60

            conditions.extend(
                (
                    projection.c.available_day == filters.available_day,
                    projection.c.available_from >= seconds(filters.available_from or "00:00"),
                    projection.c.available_until <= seconds(filters.available_until or "00:00"),
                )
            )
        return conditions

    def _items(
        self,
        connection: Connection,
        conditions: list[ColumnElement[bool]],
        *,
        compact: bool = False,
    ) -> list[CourseDetail]:
        payload = projection.c.compact if compact else offerings.c.data
        statement = select(
            payload, projection.c.snapshot_id, projection.c.source_url, projection.c.meeting_state
        ).select_from(projection)
        if not compact:
            statement = statement.join(
                offerings,
                and_(
                    offerings.c.snapshot_id == projection.c.snapshot_id,
                    offerings.c.source_id == projection.c.source_id,
                ),
            )
        grouped: dict[str, CourseDetail] = {}
        for row in connection.execute(
            statement.where(*conditions).order_by(projection.c.course_code, projection.c.source_id)
        ):
            offering = PublicOffering.model_validate(
                dict(
                    row[0],
                    snapshot_id=row.snapshot_id,
                    source_url=row.source_url,
                    meeting_state=row.meeting_state,
                )
            )
            code = offering.course.code
            if code not in grouped:
                grouped[code] = CourseDetail(code=code, titles=offering.course.titles, offerings=[])
            grouped[code].offerings.append(offering)
        for course in grouped.values():
            course.offerings.sort(
                key=lambda offering: (offering.terms, offering.source_id, offering.snapshot_id)
            )
        return list(grouped.values())

    def course_list(
        self, filters: CatalogueFilters, *, exact_code: str | None = None
    ) -> CoursePage:
        conditions = self._conditions(filters, exact_code)
        with self.engine.connect() as connection:
            total = (
                connection.scalar(
                    select(func.count(func.distinct(projection.c.course_code))).where(*conditions)
                )
                or 0
            )
            codes = list(
                connection.execute(
                    select(projection.c.course_code)
                    .where(*conditions)
                    .distinct()
                    .order_by(projection.c.course_code)
                    .limit(filters.limit)
                    .offset(filters.offset)
                ).scalars()
            )
            items = (
                self._items(connection, [*conditions, projection.c.course_code.in_(codes)])
                if codes
                else []
            )
        return CoursePage(
            items=items, total=total, limit=filters.limit, offset=filters.offset, status=self.status
        )

    def discovery(self, filters: CatalogueFilters) -> CatalogueDiscovery:
        if not filters.term:
            raise ValueError("Discovery requires a term")
        cache_key = (*self.snapshot_ids, filters.model_dump_json(exclude={"limit", "offset"}))
        with _cache_lock:
            cache = _discovery_cache.setdefault(self.engine, OrderedDict())
            items = cache.get(cache_key)
        if items is None:
            with self.engine.connect() as connection:
                items = self._items(connection, self._conditions(filters), compact=True)
            with _cache_lock:
                cache[cache_key] = items
                cache.move_to_end(cache_key)
                while len(cache) > 4:
                    cache.popitem(last=False)
        return CatalogueDiscovery(items=items, status=self.status)

    def course(self, code: str) -> CourseDetail | None:
        values = self.course_list(CatalogueFilters(), exact_code=code).items
        return values[0] if values else None

    def terms(self) -> CatalogueTerms:
        # Facets are already cached durably by immutable generation at publication.
        result: dict[str, set[str]] = {
            key: set() for key in ("terms", "faculties", "languages", "levels")
        }
        with self.engine.connect() as connection:
            for data in connection.execute(
                select(generations.c.facets).where(generations.c.snapshot_id.in_(self.snapshot_ids))
            ).scalars():
                for key, values in data.items():
                    result[key].update(values)
        return CatalogueTerms(
            **{key: sorted(values) for key, values in result.items()}, status=self.status
        )
