import importlib
import importlib.util

from test_catalogue_api import catalogue  # noqa: F401


def test_development_seed_publishes_via_repository_and_marks_provenance(catalogue):  # noqa: F811
    assert importlib.util.find_spec("unifr_api.catalogue_demo"), "Missing explicit development seed"
    demo = importlib.import_module("unifr_api.catalogue_demo")
    client, repo = catalogue
    demo.seed(repo)
    data = client.get("/api/v1/catalogue/courses").json()
    assert data["total"] == 24
    assert data["status"]["development_fixture"] is True
    assert data["status"]["stale"] is True
    assert (
        client.get("/api/v1/catalogue/courses/DEMO-003").json()["offerings"][0]["meeting_state"]
        == "unresolved"
    )


def test_development_source_exceptions_survive_publication(catalogue):  # noqa: F811
    from pathlib import Path
    from unifr_ingest.parsers import parse_calendar
    from unifr_api.catalogue_demo import seed

    client, repo = catalogue
    seed(repo)
    course = client.get("/api/v1/catalogue/courses/DEMO-004").json()["offerings"][0]
    edge = parse_calendar(Path("packages/ingest/tests/fixtures/calendar-edge.ics").read_text())[0]
    assert course["meetings"][0]["excluded_dates"] == list(edge.excluded_dates)
    assert course["meetings"][0]["additional_dates"] == ["2026-09-18", "2026-09-23T10:15:00+02:00"]
    assert course["meetings"][1]["recurrence_id"] == "2026-09-28T10:15:00+02:00"
    assert course["meeting_state"] == "unresolved"
