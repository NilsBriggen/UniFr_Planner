import importlib
import importlib.util
from pathlib import Path
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select

from unifr_ingest.models import CatalogueSnapshot, SyncReport
from unifr_ingest.parsers import parse_listing, parse_detail

FIXTURES = Path("packages/ingest/tests/fixtures")


def adapter():
    assert importlib.util.find_spec("unifr_api.catalogue"), (
        "Catalogue repository is not implemented"
    )
    return importlib.import_module("unifr_api.catalogue")


def sample(identifier="first", change=False):
    page = parse_listing((FIXTURES / "listing.html").read_text(), 1)
    page = page.model_copy(update={"reported_count": 1, "entries": (page.entries[1],)})
    html = (FIXTURES / "detail.html").read_text()
    if change:
        html = html.replace("13:15 - 17:00", "14:15 - 17:00")
    offering = parse_detail(html, page.entries[0])
    snap = CatalogueSnapshot(
        snapshot_id=identifier, reported_count=1, pages=(page,), offerings=(offering,)
    )
    report = SyncReport(
        snapshot_id=identifier,
        published=True,
        reported_count=1,
        parsed_count=1,
        pages_fetched=1,
        completed_at=datetime.now(timezone.utc),
    )
    return snap, report


def repository(tmp_path):
    m = adapter()
    engine = create_engine(f"sqlite:///{tmp_path}/catalogue.sqlite")
    m.metadata.create_all(engine)
    return m, m.SqlCatalogueRepository(engine, allow_sqlite=True), engine


def test_staged_records_are_invisible_until_atomic_publish(tmp_path):
    m, repo, engine = repository(tmp_path)
    snap, report = sample()
    repo.stage(snap, report)
    assert repo.current() is None
    assert repo.search("Art") == ()
    with repo.lock():
        repo.publish(snap, report)
    assert repo.get("135192").ects == 9
    assert len(repo.search("écologie", term="AS-2026")) == 1
    assert not repo.search("écologie", term="SS-2027")
    assert repo.search("%") == ()
    assert len(repo.current().offerings) == 1


def test_changed_meeting_records_affected_plan_without_changing_choice(tmp_path):
    m, repo, engine = repository(tmp_path)
    old, report = sample()
    repo.stage(old, report)
    with repo.lock():
        repo.publish(old, report)
    repo.track_plan("my-plan", "135192")
    new, report = sample("next", change=True)
    repo.stage(new, report)
    with repo.lock():
        repo.publish(new, report)
    changes = repo.plan_changes("my-plan")
    assert len(changes) == 1
    assert changes[0]["kind"] == "meetings_changed"
    with engine.connect() as conn:
        assert conn.execute(select(m.plan_choices)).mappings().one()["source_id"] == "135192"


def test_invalid_snapshot_cannot_bypass_publication_validation(tmp_path):
    m, repo, engine = repository(tmp_path)
    old, report = sample()
    repo.stage(old, report)
    with repo.lock():
        repo.publish(old, report)
    bad = old.model_copy(update={"snapshot_id": "bad", "offerings": ()})
    report = report.model_copy(update={"snapshot_id": "bad"})
    repo.stage(bad, report)
    with repo.lock(), pytest.raises(ValueError):
        repo.publish(bad, report)
    assert repo.current().snapshot_id == "first"


def test_publish_transaction_rolls_back_pointer_and_notifications(tmp_path):
    from sqlalchemy import event

    m, repo, engine = repository(tmp_path)
    old, report = sample()
    repo.stage(old, report)
    with repo.lock():
        repo.publish(old, report)
    new, report = sample("next", change=True)
    repo.stage(new, report)

    def break_pointer(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("UPDATE catalogue_head"):
            raise RuntimeError("simulated storage failure")

    event.listen(engine, "before_cursor_execute", break_pointer)
    with repo.lock(), pytest.raises(RuntimeError):
        repo.publish(new, report)
    event.remove(engine, "before_cursor_execute", break_pointer)
    assert repo.current().snapshot_id == "first"


def test_production_repository_refuses_sqlite_lock_substitute(tmp_path):
    m = adapter()
    with pytest.raises(ValueError, match="PostgreSQL"):
        m.SqlCatalogueRepository(create_engine("sqlite://"))


def test_source_cache_roundtrip(tmp_path):
    m, repo, engine = repository(tmp_path)
    from unifr_ingest.http import CachedResponse

    value = CachedResponse(body="public HTML", etag="v1", last_modified="today", fetched_at=123.0)
    repo.cache_put("key", value)
    assert repo.cache_get("key") == value
    repo.cache_put("key", value.model_copy(update={"body": "new HTML"}))
    assert repo.cache_get("key").body == "new HTML"


def test_publication_cannot_substitute_different_valid_data_for_staged_rows(tmp_path):
    m, repo, engine = repository(tmp_path)
    original, report = sample()
    repo.stage(original, report)
    changed, report = sample(change=True)
    with repo.lock(), pytest.raises(ValueError, match="staged"):
        repo.publish(changed, report)
    assert repo.current() is None


def test_staged_report_does_not_claim_published(tmp_path):
    m, repo, engine = repository(tmp_path)
    snap, report = sample()
    repo.stage(snap, report)
    with engine.connect() as conn:
        value = conn.execute(select(m.snapshots.c.report)).scalar_one()
    assert not value["published"]


def test_truncated_detail_cannot_replace_published_sessions(tmp_path):
    from datetime import timedelta
    from unifr_ingest.sync import sync

    _, repo, _ = repository(tmp_path)
    raw = (FIXTURES / "detail.html").read_text()
    first_session = raw.index("<td>17.09.2026</td>")
    truncated = raw[: raw.index("</tr>", first_session) + len("</tr>")]

    class FixtureSource:
        html = raw

        def listing(self, number):
            return sample()[0].pages[0]

        def detail(self, entry):
            return self.html

    source = FixtureSource()
    first = sync(source, repo, detail_ttl=timedelta(0))
    assert first.published
    before = repo.get("135192").meetings
    assert len(before) == 8
    source.html = truncated
    rejected = sync(source, repo, detail_ttl=timedelta(0))
    assert not rejected.published, (
        f"Truncated detail published {len(repo.get('135192').meetings)} meetings"
    )
    assert any("incomplete detail" in error.lower() for error in rejected.errors)
    assert repo.current().snapshot_id == first.snapshot_id
    assert repo.get("135192").meetings == before


def test_publication_rejects_missing_time_even_if_model_validation_was_bypassed(tmp_path):
    _, repo, _ = repository(tmp_path)
    first, report = sample()
    repo.stage(first, report)
    with repo.lock():
        repo.publish(first, report)
    offering = first.offerings[0]
    meeting = offering.meetings[0].model_copy(update={"ends_at": None, "unresolved": False})
    invalid = first.model_copy(
        update={
            "snapshot_id": "invalid-meeting",
            "offerings": (offering.model_copy(update={"meetings": (meeting,)}),),
        }
    )
    report = report.model_copy(update={"snapshot_id": "invalid-meeting"})
    repo.stage(invalid, report)
    with repo.lock(), pytest.raises(ValueError, match="unresolved"):
        repo.publish(invalid, report)
    assert repo.current().snapshot_id == first.snapshot_id
