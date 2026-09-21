from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import importlib
import importlib.util

import pytest

from test_parsers import fixture
from unifr_ingest.models import CatalogueSnapshot
from unifr_ingest.parsers import parse_detail, parse_listing


def sync_module():
    assert importlib.util.find_spec("unifr_ingest.sync"), "Snapshot sync is not implemented"
    return importlib.import_module("unifr_ingest.sync")


NOW = datetime(2026, 9, 17, 12, tzinfo=timezone.utc)


def one_page():
    page = parse_listing(fixture("listing.html"), 1)
    return page.model_copy(update={"reported_count": 1, "entries": (page.entries[1],)})


def snapshot(identifier="old"):
    page = one_page()
    offering = parse_detail(fixture("detail.html"), page.entries[0])
    return CatalogueSnapshot(
        snapshot_id=identifier, reported_count=1, pages=(page,), offerings=(offering,)
    )


class MemoryRepository:
    def __init__(self, current=None):
        self.value = current
        self.staged = []
        self.locked = False

    @contextmanager
    def lock(self):
        assert not self.locked
        self.locked = True
        try:
            yield
        finally:
            self.locked = False

    def current(self):
        return self.value

    def stage(self, snap, report):
        self.staged.append((snap, report))

    def publish(self, snap, report):
        assert self.locked
        self.value = snap


class Source:
    def __init__(self, repo, pages=None, detail=None):
        self.repo = repo
        self.pages = pages or {1: one_page()}
        self.calls = []
        self.html = detail or fixture("detail.html")

    def listing(self, number):
        assert self.repo.locked, "Lock must precede first network request"
        self.calls.append(("listing", number))
        return self.pages[number]

    def detail(self, entry, *, previous=None):
        self.calls.append(("detail", entry.source_id))
        self.previous_detail = previous
        return self.html


def test_valid_crawl_publishes_and_reconciles():
    m = sync_module()
    repo = MemoryRepository()
    report = m.sync(Source(repo), repo, now=NOW)
    assert report.published
    assert report.parsed_count == report.reported_count == 1
    assert report.added == 1
    assert repo.value.offerings[0].detail_checked_at == NOW


def test_parser_upgrade_reprocesses_recent_details_without_claiming_new_source_check():
    old = snapshot()
    old = old.model_copy(
        update={
            "offerings": (
                old.offerings[0].model_copy(
                    update={"parser_revision": 0, "detail_checked_at": NOW}
                ),
            )
        }
    )
    repo = MemoryRepository(old)
    source = Source(repo)
    report = sync_module().sync(source, repo, now=NOW + timedelta(minutes=10))
    assert report.published
    assert ("detail", old.offerings[0].source_id) in source.calls
    assert source.previous_detail == old.offerings[0]
    assert repo.value.offerings[0].parser_revision > 0
    assert repo.value.offerings[0].detail_checked_at == NOW


def test_broken_detail_retains_last_valid_snapshot_and_records_failure():
    m = sync_module()
    old = snapshot()
    repo = MemoryRepository(old)
    report = m.sync(Source(repo, detail="<h2>Broken fixture</h2>"), repo, now=NOW)
    assert not report.published
    assert repo.value == old
    assert repo.staged[-1][1].errors


@pytest.mark.parametrize("kind", ["missing", "count-change", "duplicate", "code-duplicate"])
def test_incomplete_or_inconsistent_crawl_never_publishes(kind):
    m = sync_module()
    old = snapshot()
    repo = MemoryRepository(old)
    page = one_page().model_copy(update={"reported_count": 2, "page_size": 1})
    second = page.model_copy(update={"number": 2})
    pages = {1: page, 2: second}
    if kind == "missing":
        del pages[2]
    elif kind == "count-change":
        pages[2] = second.model_copy(update={"reported_count": 3})
    elif kind == "code-duplicate":
        pages[2] = second.model_copy(
            update={"entries": (second.entries[0].model_copy(update={"source_id": "another"}),)}
        )
    report = m.sync(Source(repo, pages=pages), repo, now=NOW)
    assert not report.published
    assert repo.value == old


def test_mass_removal_blocks_publication():
    m = sync_module()
    old = snapshot()
    many = tuple(old.offerings[0].model_copy(update={"source_id": str(i)}) for i in range(20))
    repo = MemoryRepository(old.model_copy(update={"offerings": many}))
    report = m.sync(Source(repo), repo, now=NOW)
    assert not report.published
    assert any("removal" in error for error in report.errors)


def test_unchanged_recent_listing_reuses_detail_but_ttl_detects_detail_only_changes():
    m = sync_module()
    old = snapshot()
    old = old.model_copy(
        update={"offerings": (old.offerings[0].model_copy(update={"detail_checked_at": NOW}),)}
    )
    repo = MemoryRepository(old)
    source = Source(repo, detail=fixture("detail.html").replace("13:15 - 17:00", "14:15 - 17:00"))
    assert m.sync(source, repo, now=NOW + timedelta(hours=1)).published
    assert not any(call[0] == "detail" for call in source.calls)
    report = m.sync(source, repo, now=NOW + timedelta(days=1))
    assert report.published and report.changed == 1
    assert repo.value.offerings[0].meetings[0].starts_at.hour == 14


def test_duplicate_course_codes_are_checked_per_term():
    m = sync_module()
    old = snapshot()
    second = old.offerings[0].model_copy(update={"source_id": "other", "terms": ("SS-2027",)})
    errors, warnings = m.validate(
        old.model_copy(update={"offerings": (*old.offerings, second)}), None
    )
    assert not any("duplicate course" in error for error in errors)


def test_daily_schedule_tracks_zurich_dst():
    m = sync_module()
    due = m.next_sync(datetime(2026, 10, 24, 6, tzinfo=timezone.utc))
    assert due.isoformat() == "2026-10-25T05:00:00+01:00"


def test_live_changed_count_has_distinct_rejected_outcome():
    m = sync_module()
    repo = MemoryRepository(snapshot())
    source = Source(
        repo,
        pages={
            1: parse_listing(fixture("listing.html"), 1),
            2: parse_listing(fixture("listing-changed-count.html"), 2),
        },
    )
    report = m.sync(source, repo, now=NOW)
    assert report.outcome == "rejected_due_to_source_change"
    assert report.reported_count == 3660
    assert repo.staged[-1][0].pages[1].reported_count == 3660
    assert repo.current().snapshot_id == "old"


def test_source_changes_during_details_are_rejected_before_publish():
    m = sync_module()
    repo = MemoryRepository(snapshot())

    class ChangingSource(Source):
        def detail(self, entry):
            self.pages[1] = self.pages[1].model_copy(update={"reported_count": 2})
            return self.html

    report = m.sync(ChangingSource(repo), repo, now=NOW)
    assert not report.published
    assert report.outcome == "rejected_due_to_source_change"
    assert repo.current().snapshot_id == "old"


def cached_count_source(repo):
    entry = one_page().entries[0]
    entries = tuple(
        entry.model_copy(update={"source_id": str(i), "code": f"UE-TEST.{i}"}) for i in range(4)
    )
    first = one_page().model_copy(
        update={"reported_count": 3, "page_size": 2, "entries": entries[:2]}
    )
    second = first.model_copy(update={"number": 2, "reported_count": 4, "entries": entries[2:]})

    class CachedSource(Source):
        def detail(self, item):
            return self.html.replace(entry.code, item.code)

    return CachedSource(repo, pages={1: first, 2: second})


def test_stable_stale_page_counts_reconcile_only_with_full_coverage_and_recheck():
    repo = MemoryRepository()
    source = cached_count_source(repo)
    report = sync_module().sync(source, repo, now=NOW)
    assert report.published, report.errors
    assert report.reported_count == report.parsed_count == 4
    assert any("cached counts" in warning for warning in report.warnings)
    assert source.calls.count(("listing", 1)) == 2
    assert source.calls.count(("listing", 2)) == 2


def test_stale_count_does_not_allow_short_or_changing_pages():
    for damage in ("short", "duplicate", "changed"):
        repo = MemoryRepository()
        source = cached_count_source(repo)
        if damage == "short":
            source.pages[2] = source.pages[2].model_copy(update={"entries": ()})
        elif damage == "duplicate":
            source.pages[2] = source.pages[2].model_copy(
                update={"entries": (source.pages[1].entries[0],)}
            )
        else:
            detail = source.detail

            def change(item):
                second = source.pages[2]
                source.pages[2] = second.model_copy(
                    update={
                        "entries": (
                            second.entries[0].model_copy(update={"fingerprint": "changed"}),
                        )
                    }
                )
                return detail(item)

            source.detail = change
        report = sync_module().sync(source, repo, now=NOW)
        assert not report.published, damage
        assert repo.current() is None
