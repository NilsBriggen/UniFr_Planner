from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select

from unifr_api import catalogue_archive as archive
from unifr_api.catalogue import SqlCatalogueRepository, head, changes
from unifr_api.database import metadata
from unifr_ingest.parsers import parse_listing

NOW = datetime(2026, 9, 22, tzinfo=timezone.utc)
FIXTURES = Path("packages/ingest/tests/fixtures")


class Source:
    def __init__(self):
        self.calls = []
        self.fail = False
        self.changed = False

    def semesters(self):
        self.calls.append("semesters")
        return {"AS-2024": "250", "SS-2025": "251", "AS-2026": "254"}

    def listing(self, number, *, semester=""):
        self.calls.append(("listing", semester, number))
        page = parse_listing((FIXTURES / "listing.html").read_text(), 1)
        term = {"250": "AS-2024", "251": "SS-2025"}[semester]
        entry = page.entries[1].model_copy(update={"terms": (term, "AS-2025")})
        if self.changed and len([c for c in self.calls if isinstance(c, tuple)]) > 1:
            entry = entry.model_copy(update={"fingerprint": "changed"})
        return page.model_copy(update={"reported_count": 1, "entries": (entry,)})

    def detail(self, entry):
        self.calls.append(("detail", entry.source_id))
        if self.fail:
            raise OSError("offline")
        return (FIXTURES / "detail.html").read_text().replace("AS-2026", " ".join(entry.terms))


@pytest.fixture
def setup(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/archive.sqlite")
    metadata.create_all(engine)
    return engine, SqlCatalogueRepository(engine, allow_sqlite=True), Source()


def drive(repo, source, now=NOW, steps=12):
    return archive.run_slice(repo, source, now=now, max_steps=steps)


def test_slice_resume_and_archive_publication_isolation(setup):
    engine, repo, source = setup
    drive(repo, source, steps=1)
    drive(repo, source, steps=1)
    before = source.calls.count(("detail", "135192"))
    drive(repo, source, steps=1)
    drive(repo, source)
    assert before == 1
    assert source.calls.count(("detail", "135192")) == 2  # one per historical semester
    rows = archive.coverage(engine)
    assert [r["term"] for r in rows] == ["SS-2025", "AS-2024"]
    assert all(r["status"] == "published" for r in rows)
    assert repo.current() is None
    with engine.connect() as connection:
        assert connection.scalar(select(head.c.snapshot_id)) is None
        assert list(connection.execute(select(changes))) == []
        assert archive.protected_snapshot_ids(connection) == {r["snapshot_id"] for r in rows}
    assert archive.ArchiveRepository(repo, "SS-2025").current().offerings[0].terms == (
        "SS-2025",
        "AS-2025",
    )


def test_priority_yields_without_source_requests(setup):
    _, repo, source = setup
    result = archive.run_slice(repo, source, now=NOW, current_due=lambda: True)
    assert result["outcome"] == "yielded"
    assert source.calls == []


def test_partial_failure_keeps_prior_head_and_other_terms_progress(setup):
    engine, repo, source = setup
    drive(repo, source)
    original = {r["term"]: r["snapshot_id"] for r in archive.coverage(engine)}
    source.fail = True
    drive(repo, source, NOW + timedelta(days=32))
    rows = archive.coverage(engine)
    assert all(r["status"] == "failed" for r in rows)
    assert all(r["snapshot_id"] == original[r["term"]] for r in rows)
    assert all(r["error"] and r["next_attempt_at"] for r in rows)
    calls = len(source.calls)
    drive(repo, source, NOW + timedelta(days=32, minutes=1))
    assert len(source.calls) == calls


def test_monthly_refresh_and_unknown_empty_cannot_publish(setup):
    engine, repo, source = setup
    drive(repo, source)
    calls = len(source.calls)
    drive(repo, source, NOW + timedelta(days=29))
    assert len(source.calls) == calls + 1  # daily selector discovery only
    drive(repo, source, NOW + timedelta(days=32))
    assert len(source.calls) > calls
    assert all(
        r["checked_at"] == (NOW + timedelta(days=32)).isoformat() for r in archive.coverage(engine)
    )


def test_listing_recheck_rejects_changed_archive(setup):
    engine, repo, source = setup
    source.changed = True
    drive(repo, source)
    rows = archive.coverage(engine)
    assert rows[0]["snapshot_id"] is None
    assert rows[0]["status"] == "failed"
    assert "recheck" in rows[0]["error"]


@pytest.mark.parametrize(
    ("delay", "expected_details"), [(timedelta(minutes=16), 2), (timedelta(days=2), 4)]
)
def test_changed_index_restarts_safely_and_reuses_only_matching_recent_details(
    setup, delay, expected_details
):
    engine, repo, _ = setup

    class ChangingSource(Source):
        def semesters(self):
            return {"AS-2024": "250"}

        def listing(self, number, *, semester=""):
            self.calls.append(("listing", semester, number))
            original = parse_listing((FIXTURES / "listing.html").read_text(), 1).entries[1]
            first = original.model_copy(update={"terms": ("AS-2024",)})
            second = first.model_copy(
                update={
                    "source_id": "135193",
                    "code": "UE-L17.01684",
                    "title": "Second archived course",
                    "fingerprint": "second-fingerprint",
                }
            )
            entries = (
                (first, second)
                if len([call for call in self.calls if call[0] == "detail"]) < 2
                else (second, first)
            )
            return parse_listing((FIXTURES / "listing.html").read_text(), 1).model_copy(
                update={"reported_count": 2, "entries": entries}
            )

        def detail(self, entry):
            self.calls.append(("detail", entry.source_id))
            return (
                (FIXTURES / "detail.html")
                .read_text()
                .replace("AS-2026", "AS-2024")
                .replace("UE-L17.01683", entry.code)
            )

    source = ChangingSource()
    drive(repo, source, steps=8)
    row = archive.coverage(engine)[0]
    assert row["status"] == "failed" and row["snapshot_id"] is None
    assert len([call for call in source.calls if call[0] == "detail"]) == 2
    drive(repo, source, now=NOW + delay, steps=8)
    row = archive.coverage(engine)[0]
    assert row["status"] == "published" and row["snapshot_id"]
    assert len([call for call in source.calls if call[0] == "detail"]) == expected_details
    assert len(archive.ArchiveRepository(repo, "AS-2024").current().offerings) == 2


def test_count_change_between_pages_never_advances_to_details(setup):
    engine, repo, source = setup
    original = source.listing

    def changed_count(number, *, semester):
        page = original(number, semester=semester)
        return page.model_copy(
            update={"number": number, "reported_count": 2 if number == 1 else 3, "page_size": 1}
        )

    source.listing = changed_count
    drive(repo, source, steps=6)
    assert all(
        row["status"] == "failed" and row["snapshot_id"] is None for row in archive.coverage(engine)
    )
    assert all("result count" in row["error"] for row in archive.coverage(engine))
    assert not any(call[0] == "detail" for call in source.calls if isinstance(call, tuple))


def test_duplicate_ids_are_rejected_but_a_corrected_complete_index_can_publish(setup):
    engine, repo, _ = setup

    class DuplicateSource(Source):
        duplicate = True

        def semesters(self):
            return {"AS-2024": "250"}

        def listing(self, number, *, semester=""):
            self.calls.append(("listing", semester, number))
            page = parse_listing((FIXTURES / "listing.html").read_text(), 1)
            first = page.entries[1].model_copy(update={"terms": ("AS-2024",)})
            second = first.model_copy(update={"source_id": "135193", "code": "UE-L17.01684"})
            return page.model_copy(
                update={
                    "number": number,
                    "reported_count": 2,
                    "page_size": 1,
                    "entries": (first if number == 1 or self.duplicate else second,),
                }
            )

        def detail(self, entry):
            self.calls.append(("detail", entry.source_id))
            return (
                (FIXTURES / "detail.html")
                .read_text()
                .replace("AS-2026", "AS-2024")
                .replace("UE-L17.01683", entry.code)
            )

    source = DuplicateSource()
    drive(repo, source, steps=8)
    row = archive.coverage(engine)[0]
    assert row["status"] == "failed" and row["snapshot_id"] is None
    assert "duplicate source IDs" in row["error"]
    assert not any(call[0] == "detail" for call in source.calls)

    source.duplicate = False
    drive(repo, source, now=NOW + timedelta(minutes=16), steps=8)
    row = archive.coverage(engine)[0]
    assert row["status"] == "published" and row["snapshot_id"]
    assert len(archive.ArchiveRepository(repo, "AS-2024").current().offerings) == 2


def test_changed_index_during_refresh_keeps_last_published_archive(setup):
    engine, repo, source = setup
    drive(repo, source)
    previous = {row["term"]: row["snapshot_id"] for row in archive.coverage(engine)}
    original = source.listing
    calls = 0

    def changed_on_recheck(number, *, semester):
        nonlocal calls
        calls += 1
        page = original(number, semester=semester)
        if calls % 2 == 0:
            entry = page.entries[0].model_copy(update={"fingerprint": "changed-after-detail"})
            return page.model_copy(update={"entries": (entry,)})
        return page

    source.listing = changed_on_recheck
    drive(repo, source, NOW + timedelta(days=32))
    rows = archive.coverage(engine)
    assert all(
        row["status"] == "failed" and row["snapshot_id"] == previous[row["term"]] for row in rows
    )
    assert all(archive.ArchiveRepository(repo, row["term"]).current() for row in rows)


@pytest.mark.parametrize(
    ("date", "past"),
    [
        (datetime(2026, 1, 31, tzinfo=timezone.utc), ["AS-2024", "SS-2025"]),
        (datetime(2026, 7, 31, 23, tzinfo=timezone.utc), ["AS-2024", "SS-2025"]),
    ],
)
def test_zurich_semester_boundary(date, past):
    assert [t for t in ["AS-2024", "SS-2025", "AS-2026"] if archive.is_past(t, date)] == past


def test_scheduler_current_due_guard_and_running_job(setup):
    from unifr_api.scheduler import current_catalogue_due
    from unifr_api.operations import put_state, runs
    from sqlalchemy import insert

    engine, _, _ = setup
    metadata.create_all(engine)
    assert current_catalogue_due(engine, NOW)
    put_state(engine, "next:catalogue", (NOW + timedelta(hours=1)).isoformat())
    assert not current_catalogue_due(engine, NOW)
    put_state(engine, "next:catalogue", (NOW + timedelta(seconds=100)).isoformat())
    assert current_catalogue_due(engine, NOW)
    put_state(engine, "next:catalogue", (NOW + timedelta(hours=1)).isoformat())
    with engine.begin() as connection:
        connection.execute(
            insert(runs).values(
                id="running",
                job="catalogue",
                due_at=NOW.isoformat(),
                started_at=NOW.isoformat(),
                outcome="running",
                details={},
            )
        )
    assert current_catalogue_due(engine, NOW)


def test_transport_retry_resumes_completed_details(setup):
    engine, repo, source = setup
    drive(repo, source, steps=2)
    source.fail = True
    original_listing = source.listing
    source.listing = lambda *args, **kwargs: (_ for _ in ()).throw(OSError("temporary"))
    drive(repo, source, steps=1)
    assert archive.coverage(engine)[0]["status"] == "failed"
    source.listing = original_listing
    source.fail = False
    drive(repo, source, NOW + timedelta(minutes=16))
    # Newest term detail was checkpointed before recheck failure; only older detail fetched.
    assert source.calls.count(("detail", "135192")) == 2
    assert all(r["status"] == "published" for r in archive.coverage(engine))


def test_semester_boundaries_use_zurich_not_utc():
    assert not archive.is_past("AS-2025", datetime(2026, 1, 31, 22, tzinfo=timezone.utc))
    assert archive.is_past("AS-2025", datetime(2026, 1, 31, 23, tzinfo=timezone.utc))
    assert not archive.is_past("SS-2026", datetime(2026, 7, 31, 21, tzinfo=timezone.utc))
    assert archive.is_past("SS-2026", datetime(2026, 7, 31, 22, tzinfo=timezone.utc))


def test_archive_does_not_change_existing_current_head_or_notify_student(setup):
    from test_catalogue import sample
    from unifr_api.catalogue import snapshots

    engine, repo, source = setup
    snapshot, report = sample("current")
    repo.stage(snapshot, report)
    with repo.lock():
        repo.publish(snapshot, report)
    repo.track_plan("student", snapshot.offerings[0].source_id)
    drive(repo, source)
    assert repo.current() == snapshot
    assert repo.plan_changes("student") == ()
    with engine.connect() as connection:
        reports = list(
            connection.scalars(select(snapshots.c.report).where(snapshots.c.id != "current"))
        )
    assert {r["source_hashes"]["archive_term"] for r in reports} == {"SS-2025", "AS-2024"}


def test_archive_mass_removal_rejected_and_old_head_retained(setup):
    engine, repo, source = setup
    drive(repo, source)
    previous = archive.coverage(engine)[0]["snapshot_id"]
    original = source.listing

    def empty(number, *, semester):
        return original(number, semester=semester).model_copy(
            update={"reported_count": 0, "entries": ()}
        )

    source.listing = empty
    drive(repo, source, NOW + timedelta(days=32))
    row = archive.coverage(engine)[0]
    assert row["snapshot_id"] == previous
    assert row["status"] == "failed"
    assert "mass removal" in row["error"]


def test_priority_checked_between_archive_operations(setup):
    engine, repo, source = setup

    def due():
        return any(isinstance(c, tuple) for c in source.calls)

    result = archive.run_slice(repo, source, now=NOW, current_due=due)
    assert result == {"outcome": "yielded", "steps": 1}
    assert source.calls == ["semesters", ("listing", "251", 1)]
    assert archive.coverage(engine)[0]["snapshot_id"] is None


@pytest.mark.parametrize("corruption", ["duplicate", "missing-page", "wrong-term"])
def test_partial_or_wrong_semester_listings_never_publish(setup, corruption):
    engine, repo, source = setup
    original = source.listing

    def broken(number, *, semester):
        page = original(number, semester=semester)
        if corruption == "duplicate":
            return page.model_copy(update={"reported_count": 2, "entries": page.entries * 2})
        if corruption == "wrong-term":
            return page.model_copy(
                update={"entries": (page.entries[0].model_copy(update={"terms": ("SS-2020",)}),)}
            )
        if number > 1:
            raise OSError("missing page")
        return page.model_copy(update={"reported_count": 13})

    source.listing = broken
    drive(repo, source)
    assert all(
        r["status"] == "failed" and r["snapshot_id"] is None for r in archive.coverage(engine)
    )
    assert not any(c[0] == "detail" for c in source.calls if isinstance(c, tuple))


def test_discovery_failure_is_durable_and_not_empty_success(setup):
    engine, repo, source = setup
    source.semesters = lambda: {}
    drive(repo, source)
    marker = repo.cache_get("archive-semester-discovery")
    assert marker is not None and "Empty semester discovery" in marker.body
    assert archive.coverage(engine) == []


def test_checkpoints_survive_ordinary_snapshot_retention(setup):
    from test_catalogue import sample

    engine, repo, source = setup
    drive(repo, source, steps=2)
    for i in range(12):
        snapshot, report = sample(f"current-{i}")
        repo.stage(snapshot, report)
        with repo.lock():
            repo.publish(snapshot, report)
    with repo.lock():
        repo.prune(NOW)
    # Snapshot pruning cannot erase the independent listing/detail checkpoints.
    with engine.connect() as connection:
        assert len(list(connection.execute(select(archive.checkpoints)))) == 2
    drive(repo, source)
    assert all(r["status"] == "published" for r in archive.coverage(engine))
    assert source.calls.count(("detail", "135192")) == 2
