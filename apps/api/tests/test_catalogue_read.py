"""Bounded read evidence, including a reproducible 3,750-offering benchmark."""

from datetime import datetime, timezone
from time import perf_counter

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event, insert

from test_catalogue import sample
from unifr_api.catalogue import (
    SqlCatalogueRepository,
    courses,
    head,
    metadata,
    offerings,
    snapshots,
)
from unifr_api.catalogue_read import CatalogueFilters, CatalogueReadService, PublicOffering, matches
from unifr_ingest.models import Meeting


def populated(identifier, count=3750):
    snap, report = sample(identifier)
    records, entries = [], []
    for i in range(count):
        code = f"C{i // 2:04}"
        record = snap.offerings[0].model_copy(
            update={
                "source_id": str(i),
                "course": snap.offerings[0].course.model_copy(
                    update={"code": code, "titles": {"en": f"Straße %_{i}"}}
                ),
                "faculty_domain": "Science" if i % 2 else "Arts",
                "languages": ("fr",) if i % 2 else ("de",),
                "levels": ("Master",) if i % 2 else ("Bachelor",),
                "terms": ("AS-2026",) if i % 2 else ("SS-2027",),
                "ects": i % 10 if i % 5 else None,
                "assessment": "Large narrative " * 100,
                "meetings": (
                    Meeting(
                        starts_at=datetime(2026, 9, 21, 10, tzinfo=timezone.utc),
                        ends_at=datetime(2026, 9, 21, 11, tzinfo=timezone.utc),
                    ),
                ),
            }
        )
        records.append(record)
        entries.append(
            snap.pages[0]
            .entries[0]
            .model_copy(update={"source_id": str(i), "code": code, "terms": record.terms})
        )
    snap = snap.model_copy(
        update={
            "reported_count": count,
            "offerings": tuple(records),
            "pages": (
                snap.pages[0].model_copy(
                    update={
                        "reported_count": count,
                        "page_size": max(1, count),
                        "entries": tuple(entries),
                    }
                ),
            ),
        }
    )
    return snap, report.model_copy(update={"reported_count": count, "parsed_count": count})


def publish(repo, snap, report):
    repo.stage(snap, report)
    with repo.lock():
        repo.publish(snap, report)


def test_populated_reads_are_bounded_and_match_reference(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path}/populated.sqlite")
    metadata.create_all(engine)
    repo = SqlCatalogueRepository(engine, allow_sqlite=True)
    snap, report = populated("large")
    publish(repo, snap, report)
    statements = []
    event.listen(
        engine,
        "before_cursor_execute",
        lambda conn, cursor, sql, parameters, context, many: statements.append(sql),
    )
    started = perf_counter()
    reader = CatalogueReadService(engine)
    reader.terms()
    metadata_ms = (perf_counter() - started) * 1000
    assert all(
        "catalogue_offering" not in sql and "catalogue_snapshot.data" not in sql
        for sql in statements
    )
    validated = []
    original = PublicOffering.model_validate

    def validate(value, *args, **kwargs):
        validated.append(value["source_id"])
        return original(value, *args, **kwargs)

    monkeypatch.setattr(PublicOffering, "model_validate", validate)
    started = perf_counter()
    page = reader.course_list(CatalogueFilters(limit=7, offset=1700))
    page_ms = (perf_counter() - started) * 1000
    assert page.total == 1875
    assert len(page.items) == 7
    assert len(validated) == 14
    validated.clear()
    assert reader.course("C1800").code == "C1800"
    assert len(validated) == 2
    for args in (
        {"q": "STRASSE %_"},
        {"q": "\\"},
        {"q": "%_3749"},
        {"faculty": "Science", "language": "de"},
        {"term": "AS-2026", "language": "fr", "ects_min": 4, "ects_max": 8},
        {"available_day": 0, "available_from": "12:00", "available_until": "13:00"},
    ):
        filters = CatalogueFilters(**args, limit=13, offset=5)
        expected = sorted({off.course.code for off in snap.offerings if matches(off, filters)})
        actual = reader.course_list(filters)
        assert actual.total == len(expected)
        assert [item.code for item in actual.items] == expected[5:18]
        assert all(matches(off, filters) for item in actual.items for off in item.offerings)
    validated.clear()
    started = perf_counter()
    discovery = reader.discovery(CatalogueFilters(term="AS-2026"))
    cold_ms = (perf_counter() - started) * 1000
    assert len(validated) == 1875
    assert all(off.assessment == "" for course in discovery.items for off in course.offerings)
    validated.clear()
    started = perf_counter()
    assert (
        CatalogueReadService(engine).discovery(CatalogueFilters(term="AS-2026")).items
        == discovery.items
    )
    warm_ms = (perf_counter() - started) * 1000
    assert validated == []
    print(
        f"3750 offerings: metadata={metadata_ms:.1f}ms page={page_ms:.1f}ms discovery cold={cold_ms:.1f}ms warm={warm_ms:.1f}ms"
    )
    engine.dispose()


def test_generation_cache_invalidation_and_engine_isolation(tmp_path):
    engines = [create_engine(f"sqlite:///{tmp_path}/{i}.sqlite") for i in range(2)]
    for engine in engines:
        metadata.create_all(engine)
    repos = [SqlCatalogueRepository(engine, allow_sqlite=True) for engine in engines]
    first, report = populated("same-id", 4)
    publish(repos[0], first, report)
    publish(repos[1], *populated("same-id", 2))
    reader = CatalogueReadService(engines[0])
    filters = CatalogueFilters(term="AS-2026")
    assert len(reader.discovery(filters).items) == 2
    assert len(CatalogueReadService(engines[1]).discovery(filters).items) == 1
    second, report = populated("new-id", 4)
    second = second.model_copy(
        update={
            "offerings": tuple(
                off.model_copy(update={"levels": ("Doctorate",)}) for off in second.offerings
            )
        }
    )
    publish(repos[0], second, report)
    fresh = CatalogueReadService(engines[0])
    assert fresh.terms().levels == ["Doctorate"]
    assert all(
        off.snapshot_id == "new-id"
        for item in fresh.discovery(filters).items
        for off in item.offerings
    )
    assert reader.terms().levels == ["Bachelor", "Master"]
    pinned = CatalogueReadService(engines[0], snapshot_ids=("same-id",))
    assert all(
        off.snapshot_id == "same-id"
        for item in pinned.discovery(filters).items
        for off in item.offerings
    )
    for engine in engines:
        engine.dispose()


def test_migration_backfills_old_published_generation(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/migration.sqlite"
    monkeypatch.setenv("UNIFR_DATABASE_URL", url)
    config = Config("alembic.ini")
    command.upgrade(config, "0005_sharing")
    engine = create_engine(url)
    snap, report = sample("old-published")
    with engine.begin() as connection:
        connection.execute(
            insert(snapshots).values(
                id=snap.snapshot_id,
                status="published",
                data=snap.model_dump(mode="json", exclude={"offerings"}),
                report=report.model_dump(mode="json"),
            )
        )
        connection.execute(insert(courses).values(code=snap.offerings[0].course.code))
        connection.execute(
            insert(offerings).values(
                snapshot_id=snap.snapshot_id,
                source_id=snap.offerings[0].source_id,
                course_code=snap.offerings[0].course.code,
                search_text="old",
                data=snap.offerings[0].model_dump(mode="json"),
            )
        )
        connection.execute(insert(head).values(id=1, snapshot_id=snap.snapshot_id))
    command.upgrade(config, "0006_catalogue_read")
    reader = CatalogueReadService(engine)
    assert reader.status.snapshot_id == snap.snapshot_id
    assert reader.course_list(CatalogueFilters(q="écologie")).total == 1
    assert (
        reader.course(snap.offerings[0].course.code).offerings[0].source_url
        == snap.pages[0].entries[0].detail_url
    )
    assert reader.terms().terms == list(snap.offerings[0].terms)
    command.downgrade(config, "0005_sharing")
    engine.dispose()


def test_archive_reports_do_not_replace_current_sync_status(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/status.sqlite")
    metadata.create_all(engine)
    repo = SqlCatalogueRepository(engine, allow_sqlite=True)
    snap, report = populated("current", 2)
    report = report.model_copy(update={"outcome": "published"})
    publish(repo, snap, report)
    archive, archive_report = populated("archive-rejected", 2)
    archive_report = archive_report.model_copy(
        update={
            "published": False,
            "outcome": "rejected_due_to_source_change",
            "source_hashes": {"archive_term": "AS-2020"},
        }
    )
    repo.stage(archive, archive_report)
    reader = CatalogueReadService(engine)
    assert reader.status.snapshot_id == "current"
    assert reader.status.latest_sync_outcome == "published"
    engine.dispose()


def test_warm_current_reads_stay_bounded_with_five_years_of_archive_data(tmp_path):
    """Controlled local benchmark; print p95 rather than timing-gating shared CI."""
    from unifr_api.catalogue_archive import ArchiveRepository
    from unifr_api.catalogue_archive_schema import archive_terms
    from unifr_ingest.sync import listing_hash

    engine = create_engine(f"sqlite:///{tmp_path}/five-years.sqlite")
    metadata.create_all(engine)
    repo = SqlCatalogueRepository(engine, allow_sqlite=True)
    publish(repo, *populated("current-scale", 3750))
    for year in range(2021, 2026):
        for season in ("AS", "SS"):
            term = f"{season}-{year}"
            snap, report = populated(f"history-{term}", 1875)
            pages = tuple(
                page.model_copy(
                    update={
                        "entries": tuple(
                            entry.model_copy(
                                update={"terms": (term,), "code": f"H{entry.source_id}"}
                            )
                            for entry in page.entries
                        )
                    }
                )
                for page in snap.pages
            )
            snap = snap.model_copy(
                update={
                    "pages": pages,
                    "offerings": tuple(
                        off.model_copy(
                            update={
                                "terms": (term,),
                                "course": off.course.model_copy(
                                    update={"code": f"H{off.source_id}"}
                                ),
                            }
                        )
                        for off in snap.offerings
                    ),
                    "verified_listing_hash": listing_hash(pages),
                }
            )
            report = report.model_copy(update={"source_hashes": {"archive_term": term}})
            with engine.begin() as connection:
                connection.execute(
                    insert(archive_terms).values(
                        term=term, source_value="fixture", status="pending", failures=0, progress={}
                    )
                )
            repo.stage(snap, report)
            with repo.lock():
                ArchiveRepository(repo, term).publish(snap, report)
    timings = {key: [] for key in ("status", "facets", "page")}
    for _ in range(21):
        started = perf_counter()
        reader = CatalogueReadService(engine)
        timings["status"].append((perf_counter() - started) * 1000)
        assert reader.snapshot_ids == ("current-scale",)
        started = perf_counter()
        assert reader.terms().terms == ["AS-2026", "SS-2027"]
        timings["facets"].append((perf_counter() - started) * 1000)
        started = perf_counter()
        page = reader.course_list(CatalogueFilters(term="AS-2026", limit=20))
        assert page.total == 1875 and len(page.items) == 20
        timings["page"].append((perf_counter() - started) * 1000)
    p95 = {key: round(sorted(values[1:])[18], 1) for key, values in timings.items()}
    print(f"3750 current + 18750 historical offerings over 5 years; warm p95 ms={p95}")
    engine.dispose()
