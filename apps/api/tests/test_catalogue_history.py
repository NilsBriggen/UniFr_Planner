from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, insert, select

from unifr_api.catalogue import SqlCatalogueRepository, head, metadata, snapshots
from unifr_api.catalogue_archive import ArchiveRepository
from unifr_api.catalogue_archive_schema import archive_terms
from unifr_api.catalogue_demo import seed
from unifr_api.catalogue_projection import generations
from unifr_api.main import app
from unifr_ingest.sync import listing_hash
from test_catalogue import sample


@pytest.fixture
def empty_history(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/history.sqlite"
    monkeypatch.setenv("UNIFR_DATABASE_URL", url)
    engine = create_engine(url)
    metadata.create_all(engine)
    repo = SqlCatalogueRepository(engine, allow_sqlite=True)
    yield TestClient(app), repo
    engine.dispose()


@pytest.fixture
def history(empty_history):
    client, repo = empty_history
    seed(repo)
    return client, repo


def publish_archive(repo, term, identifier, ects=4):
    snap, report = sample(identifier)
    values = tuple(o.model_copy(update={"terms": (term,), "ects": ects}) for o in snap.offerings)
    pages = tuple(
        p.model_copy(
            update={"entries": tuple(e.model_copy(update={"terms": (term,)}) for e in p.entries)}
        )
        for p in snap.pages
    )
    snap = snap.model_copy(
        update={"pages": pages, "offerings": values, "verified_listing_hash": listing_hash(pages)}
    )
    report = report.model_copy(update={"source_hashes": {"archive_term": term}})
    with repo.engine.begin() as connection:
        if not connection.scalar(select(archive_terms.c.term).where(archive_terms.c.term == term)):
            connection.execute(
                insert(archive_terms).values(
                    term=term, source_value="fixture", status="pending", failures=0, progress={}
                )
            )
    repo.stage(snap, report)
    with repo.lock():
        ArchiveRepository(repo, term).publish(snap, report)
    return snap


def test_history_is_independent_and_keeps_exact_offering_provenance(history):
    client, repo = history
    status = client.get("/api/v1/status/catalogue").json()
    assert status["snapshot_id"] == "development-fixture-catalogue"
    assert status["latest_sync_outcome"] == "published"
    assert client.get("/api/v1/catalogue/courses?q=Historical").json()["items"] == []
    page = client.get("/api/v1/catalogue/courses?scope=history&term=AS-2024").json()
    assert page["total"] == 2
    assert [c["offerings"][0]["ects"] for c in page["items"]] == [6, 5]
    assert all(
        c["offerings"][0]["snapshot_id"] == "development-fixture-history-AS-2024"
        for c in page["items"]
    )
    assert all("show=98" in c["offerings"][0]["source_url"] for c in page["items"])
    assert (
        client.get("/api/v1/catalogue/courses/HIST-001?scope=history&term=AS-2024").status_code
        == 200
    )
    assert client.get("/api/v1/catalogue/courses/HIST-001").status_code == 404
    with repo.engine.connect() as connection:
        assert (
            connection.scalar(
                select(generations.c.outcome).where(
                    generations.c.snapshot_id == page["status"]["snapshot_id"]
                )
            )
            == "published"
        )
    with repo.engine.begin() as connection:
        connection.execute(delete(head))
    assert client.get("/api/v1/catalogue/courses?scope=history&term=AS-2024").status_code == 200
    assert client.get("/api/v1/status/catalogue").json()["availability"] == "unavailable"


def test_missing_pending_failed_and_empty_archives_are_distinct(history):
    client, repo = history
    with repo.engine.begin() as connection:
        for term, state in (
            ("SS-2025", "pending"),
            ("AS-2025", "in_progress"),
            ("SS-2026", "failed"),
        ):
            connection.execute(
                insert(archive_terms).values(
                    term=term,
                    source_value="fixture",
                    status=state,
                    failures=0,
                    progress={},
                    error="internal error must not leak",
                )
            )
    terms = client.get("/api/v1/catalogue/terms?scope=history").json()
    assert {row["term"]: row["status"] for row in terms["coverage"]} == {
        "AS-2024": "available",
        "SS-2025": "pending",
        "AS-2025": "loading",
        "SS-2026": "failed",
    }
    assert "internal error" not in str(terms)
    for term in ("AS-2023", "SS-2025", "AS-2025", "SS-2026"):
        assert client.get(f"/api/v1/catalogue/courses?scope=history&term={term}").status_code == 503
    empty = client.get("/api/v1/catalogue/courses?scope=history&term=AS-2024&q=missing")
    assert empty.status_code == 200
    assert empty.json()["total"] == 0


def test_failed_refresh_serves_prior_valid_archive_and_exposes_refresh_state(history):
    client, repo = history
    with repo.engine.begin() as connection:
        connection.execute(archive_terms.update().values(status="failed", error="source changed"))
    row = client.get("/api/v1/catalogue/terms?scope=history").json()["coverage"][0]
    assert row["status"] == "available" and row["refresh_failed"]
    assert client.get("/api/v1/catalogue/courses?scope=history&term=AS-2024").json()["total"] == 2


def test_same_code_retains_each_historical_ects_and_never_substitutes_current(empty_history):
    client, repo = empty_history
    first = publish_archive(repo, "AS-2022", "archive-one", 4)
    publish_archive(repo, "AS-2023", "archive-two", 5)
    current, report = sample("new-current")
    current = current.model_copy(
        update={"offerings": tuple(o.model_copy(update={"ects": 9}) for o in current.offerings)}
    )
    repo.stage(current, report)
    with repo.lock():
        repo.publish(current, report)
    code = first.offerings[0].course.code
    for term, ects in (("AS-2022", 4), ("AS-2023", 5)):
        page = client.get(
            f"/api/v1/catalogue/courses?scope=history&term={term}&codes={code}"
        ).json()
        assert page["items"][0]["offerings"][0]["ects"] == ects
    assert (
        client.get(f"/api/v1/catalogue/courses?codes={code}").json()["items"][0]["offerings"][0][
            "ects"
        ]
        == 9
    )


def test_archive_heads_survive_retention_without_consuming_current_budget(empty_history):
    _, repo = empty_history
    for index in range(9):
        snap, report = sample(f"current-{index}")
        repo.stage(snap, report)
        with repo.lock():
            repo.publish(snap, report)
    for year in range(2021, 2026):
        for season in ("AS", "SS"):
            term = f"{season}-{year}"
            publish_archive(repo, term, f"archive-{term}")
    publish_archive(repo, "AS-2021", "archive-replacement")
    with repo.lock():
        repo.prune(datetime.now(timezone.utc))
    with repo.engine.connect() as connection:
        ids = set(connection.scalars(select(snapshots.c.id)))
        heads = set(connection.scalars(select(archive_terms.c.snapshot_id)))
        assert heads <= ids
        assert "archive-AS-2021" not in ids
        assert len(ids - heads) == 7
        assert repo.current().snapshot_id == "current-8"
