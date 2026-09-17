"""SQL persistence adapter for validated, immutable catalogue generations."""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Column,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    Engine,
    delete,
    insert,
    select,
    text,
    update,
)

from unifr_ingest.http import CachedResponse
from unifr_ingest.models import CatalogueSnapshot, Offering, SyncReport
from unifr_ingest.sync import validate

from .database import metadata

snapshots = Table(
    "catalogue_snapshot",
    metadata,
    Column("id", String, primary_key=True),
    Column("status", String, nullable=False),
    Column("data", JSON, nullable=False),
    Column("report", JSON, nullable=False),
)
head = Table(
    "catalogue_head",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("snapshot_id", ForeignKey("catalogue_snapshot.id"), nullable=False),
)
courses = Table("catalogue_course", metadata, Column("code", String, primary_key=True))
offerings = Table(
    "catalogue_offering",
    metadata,
    Column("snapshot_id", ForeignKey("catalogue_snapshot.id"), primary_key=True),
    Column("source_id", String, primary_key=True),
    Column("course_code", ForeignKey("catalogue_course.code"), nullable=False),
    Column("search_text", Text, nullable=False),
    Column("data", JSON, nullable=False),
)
meetings = Table(
    "catalogue_meeting",
    metadata,
    Column("snapshot_id", ForeignKey("catalogue_snapshot.id"), primary_key=True),
    Column("source_id", String, primary_key=True),
    Column("ordinal", Integer, primary_key=True),
    Column("data", JSON, nullable=False),
)
assignments = Table(
    "catalogue_assignment",
    metadata,
    Column("snapshot_id", ForeignKey("catalogue_snapshot.id"), primary_key=True),
    Column("source_id", String, primary_key=True),
    Column("ordinal", Integer, primary_key=True),
    Column("data", JSON, nullable=False),
)
source_cache = Table(
    "catalogue_source_cache",
    metadata,
    Column("key", String, primary_key=True),
    Column("data", JSON, nullable=False),
)
# Task 3/plan adapters register references; ingestion never edits those choices.
plan_choices = Table(
    "catalogue_plan_reference",
    metadata,
    Column("plan_id", String, primary_key=True),
    Column("source_id", String, primary_key=True),
)
changes = Table(
    "catalogue_plan_change",
    metadata,
    Column("id", String, primary_key=True),
    Column("plan_id", String, nullable=False),
    Column("source_id", String, nullable=False),
    Column("snapshot_id", String, nullable=False),
    Column("kind", String, nullable=False),
    Column("before", JSON),
    Column("after", JSON),
)


class SqlCatalogueRepository:
    def __init__(self, engine: Engine, *, allow_sqlite: bool = False) -> None:
        if engine.dialect.name != "postgresql" and not allow_sqlite:
            raise ValueError("Production catalogue sync requires PostgreSQL advisory locking")
        self.engine = engine
        self.locked = False

    @contextmanager
    def lock(self) -> Iterator[None]:
        if self.locked:
            raise RuntimeError("Catalogue sync already locked")
        with self.engine.connect() as connection:
            postgres = self.engine.dialect.name == "postgresql"
            if postgres:
                acquired = connection.execute(
                    text("SELECT pg_try_advisory_lock(854712091)")
                ).scalar()
                connection.commit()
                if not acquired:
                    raise RuntimeError("Another catalogue sync holds the advisory lock")
            self.locked = True
            try:
                yield
            finally:
                self.locked = False
                if postgres:
                    connection.execute(text("SELECT pg_advisory_unlock(854712091)"))
                    connection.commit()

    def current(self) -> CatalogueSnapshot | None:
        with self.engine.connect() as connection:
            row = connection.execute(
                select(snapshots.c.data).join(head, head.c.snapshot_id == snapshots.c.id)
            ).first()
            if row is None:
                return None
            data = dict(row[0])
            data["offerings"] = [
                row[0]
                for row in connection.execute(
                    select(offerings.c.data).where(offerings.c.snapshot_id == data["snapshot_id"])
                )
            ]
            return CatalogueSnapshot.model_validate(data)

    def stage(self, snapshot: CatalogueSnapshot, report: SyncReport) -> None:
        with self.engine.begin() as connection:
            connection.execute(
                insert(snapshots).values(
                    id=snapshot.snapshot_id,
                    status="staged" if report.published else "rejected",
                    data=snapshot.model_dump(mode="json", exclude={"offerings"}),
                    report=report.model_copy(
                        update={
                            "published": False,
                            "outcome": "staged" if report.published else report.outcome,
                        }
                    ).model_dump(mode="json"),
                )
            )
            existing = set(connection.execute(select(courses.c.code)).scalars())
            codes = {off.course.code for off in snapshot.offerings} - existing
            if codes:
                connection.execute(insert(courses), [{"code": code} for code in codes])
            for offering in snapshot.offerings:
                connection.execute(
                    insert(offerings).values(
                        snapshot_id=snapshot.snapshot_id,
                        source_id=offering.source_id,
                        course_code=offering.course.code,
                        search_text=" ".join(
                            (
                                offering.course.code,
                                *offering.course.titles.values(),
                                offering.lecturer,
                                offering.faculty_domain,
                            )
                        ).casefold(),
                        data=offering.model_dump(mode="json"),
                    )
                )
                for table, values in (
                    (meetings, offering.meetings),
                    (assignments, offering.assignments),
                ):
                    if values:
                        connection.execute(
                            insert(table),
                            [
                                dict(
                                    snapshot_id=snapshot.snapshot_id,
                                    source_id=offering.source_id,
                                    ordinal=i,
                                    data=value.model_dump(mode="json"),
                                )
                                for i, value in enumerate(values)
                            ],
                        )

    def publish(self, snapshot: CatalogueSnapshot, report: SyncReport) -> None:
        if not self.locked:
            raise RuntimeError("Publication requires the catalogue advisory lock")
        previous = self.current()
        errors, _ = validate(snapshot, previous)
        if errors or not report.published or report.snapshot_id != snapshot.snapshot_id:
            raise ValueError("Invalid snapshot publication: " + "; ".join(errors))
        old = {off.source_id: off for off in previous.offerings} if previous else {}
        new = {off.source_id: off for off in snapshot.offerings}
        with self.engine.begin() as connection:
            staged = connection.execute(
                select(snapshots.c.status).where(snapshots.c.id == snapshot.snapshot_id)
            ).scalar_one()
            if staged != "staged":
                raise ValueError("Snapshot is not staged")
            staged_data = connection.execute(
                select(snapshots.c.data).where(snapshots.c.id == snapshot.snapshot_id)
            ).scalar_one()
            staged_offerings = tuple(
                Offering.model_validate(row[0])
                for row in connection.execute(
                    select(offerings.c.data).where(offerings.c.snapshot_id == snapshot.snapshot_id)
                )
            )
            if (
                staged_data != snapshot.model_dump(mode="json", exclude={"offerings"})
                or {off.source_id: off for off in staged_offerings} != new
            ):
                raise ValueError("Publication differs from staged data")
            for ref in connection.execute(select(plan_choices)).mappings():
                before, after = old.get(ref["source_id"]), new.get(ref["source_id"])
                kind = ""
                if before and after is None:
                    kind = "offering_removed"
                elif before and after and before.meetings != after.meetings:
                    kind = "meetings_changed"
                if kind:
                    connection.execute(
                        insert(changes).values(
                            id=str(uuid4()),
                            plan_id=ref["plan_id"],
                            source_id=ref["source_id"],
                            snapshot_id=snapshot.snapshot_id,
                            kind=kind,
                            before=before.model_dump(mode="json") if before else None,
                            after=after.model_dump(mode="json") if after else None,
                        )
                    )
            connection.execute(
                update(snapshots)
                .where(snapshots.c.id == snapshot.snapshot_id)
                .values(status="published", report=report.model_dump(mode="json"))
            )
            if connection.execute(select(head.c.id)).first():
                connection.execute(
                    update(head).where(head.c.id == 1).values(snapshot_id=snapshot.snapshot_id)
                )
            else:
                connection.execute(insert(head).values(id=1, snapshot_id=snapshot.snapshot_id))

    def search(
        self, query: str = "", *, term: str | None = None, limit: int = 50, offset: int = 0
    ) -> tuple[Offering, ...]:
        if not 1 <= limit <= 500 or offset < 0:
            raise ValueError("Invalid search pagination")
        query = query.casefold().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        statement = select(offerings.c.data).join(
            head, head.c.snapshot_id == offerings.c.snapshot_id
        )
        if query:
            statement = statement.where(offerings.c.search_text.like(f"%{query}%", escape="\\"))
        # Filter term before pagination, including offerings spanning two semesters.
        with self.engine.connect() as connection:
            values = (
                Offering.model_validate(row[0])
                for row in connection.execute(
                    statement.order_by(offerings.c.course_code, offerings.c.source_id)
                )
            )
            matching = [off for off in values if term is None or term in off.terms]
            return tuple(matching[offset : offset + limit])

    def get(self, source_id: str) -> Offering | None:
        with self.engine.connect() as connection:
            data = connection.execute(
                select(offerings.c.data)
                .join(head, head.c.snapshot_id == offerings.c.snapshot_id)
                .where(offerings.c.source_id == source_id)
            ).scalar()
            return Offering.model_validate(data) if data else None

    def cache_get(self, key: str) -> CachedResponse | None:
        with self.engine.connect() as connection:
            data = connection.execute(
                select(source_cache.c.data).where(source_cache.c.key == key)
            ).scalar()
            return CachedResponse.model_validate(data) if data else None

    def cache_put(self, key: str, value: CachedResponse) -> None:
        with self.engine.begin() as connection:
            connection.execute(delete(source_cache).where(source_cache.c.key == key))
            connection.execute(insert(source_cache).values(key=key, data=value.model_dump()))

    def track_plan(self, plan_id: str, source_id: str) -> None:
        with self.engine.begin() as connection:
            if not connection.execute(
                select(plan_choices).where(
                    plan_choices.c.plan_id == plan_id, plan_choices.c.source_id == source_id
                )
            ).first():
                connection.execute(
                    insert(plan_choices).values(plan_id=plan_id, source_id=source_id)
                )

    def plan_changes(self, plan_id: str) -> tuple[dict[str, Any], ...]:
        with self.engine.connect() as connection:
            return tuple(
                dict(row)
                for row in connection.execute(
                    select(changes).where(changes.c.plan_id == plan_id)
                ).mappings()
            )
