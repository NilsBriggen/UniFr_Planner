"""Opt-in integration controls; each run uses a new disposable PostgreSQL schema."""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.schema import CreateSchema, DropSchema

from unifr_api.catalogue import SqlCatalogueRepository, metadata
from unifr_ingest.parsers import parse_listing
from unifr_ingest.sync import sync


@pytest.fixture
def postgres_repo():
    url = os.environ.get("UNIFR_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set UNIFR_TEST_DATABASE_URL for real PostgreSQL lock/transaction tests")
    admin = create_engine(url)
    schema = "ingest_test_" + uuid4().hex
    with admin.begin() as conn:
        conn.execute(CreateSchema(schema))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    metadata.create_all(engine)
    try:
        yield SqlCatalogueRepository(engine)
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(DropSchema(schema, cascade=True))
        admin.dispose()


def test_postgres_advisory_lock_excludes_second_connection_and_releases(postgres_repo):
    second = SqlCatalogueRepository(postgres_repo.engine)
    with postgres_repo.lock():
        with pytest.raises(RuntimeError, match="advisory lock"):
            with second.lock():
                pytest.fail("Second connection acquired held advisory lock")
    with second.lock():
        assert second.locked


def test_postgres_cached_count_reconciliation_and_retention(postgres_repo):
    from datetime import datetime, timezone
    from sqlalchemy import func, select
    from unifr_api.catalogue import snapshots
    from unifr_ingest.http import CachedResponse
    from test_sync import cached_count_source

    repo = postgres_repo
    for _ in range(9):
        report = sync(cached_count_source(repo), repo)
        assert report.published, report.errors
        assert report.parsed_count == 4
    repo.cache_put("expired", CachedResponse(body="expired", fetched_at=1))
    with repo.lock():
        repo.prune(datetime.now(timezone.utc))
    assert repo.current().snapshot_id == report.snapshot_id
    assert repo.cache_get("expired") is None
    assert len(repo.search()) == 4
    with repo.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(snapshots)) == 7


@pytest.mark.parametrize("damage", ["broken", "truncated"])
def test_real_postgres_positive_then_broken_fixture_keeps_pointer(postgres_repo, damage):
    fixtures = Path("packages/ingest/tests/fixtures")

    class FixtureSource:
        broken = False

        def listing(self, number):
            page = parse_listing((fixtures / "listing.html").read_text(), number)
            return page.model_copy(update={"reported_count": 1, "entries": (page.entries[1],)})

        def detail(self, entry):
            raw = (fixtures / "detail.html").read_text()
            if not self.broken:
                return raw
            if damage == "truncated":
                first_session = raw.index("<td>17.09.2026</td>")
                return raw[: raw.index("</tr>", first_session) + len("</tr>")]
            return "<html>deliberately broken</html>"

    from datetime import timedelta

    source = FixtureSource()
    first = sync(source, postgres_repo)
    assert first.published
    assert len(postgres_repo.search("écologie")) == 1
    before = postgres_repo.current().snapshot_id
    meetings_before = postgres_repo.get("135192").meetings
    assert len(meetings_before) == 8
    source.broken = True
    rejected = sync(source, postgres_repo, detail_ttl=timedelta(0))
    after = postgres_repo.current().snapshot_id
    assert not rejected.published
    assert rejected.outcome == "rejected_validation"
    assert before == after == first.snapshot_id
    assert rejected.snapshot_id != first.snapshot_id
    assert any("Incomplete detail" in error for error in rejected.errors)
    assert postgres_repo.get("135192").meetings == meetings_before
    print(
        f"case={damage} positive={first.snapshot_id} rejected={rejected.snapshot_id} "
        f"before={before} after={after} meetings_before=8 meetings_after=8"
    )
