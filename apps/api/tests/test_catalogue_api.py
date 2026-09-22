from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from unifr_api.catalogue import SqlCatalogueRepository, metadata
from unifr_api.main import app
from unifr_ingest.models import CatalogueSnapshot, Meeting, SyncReport
from test_catalogue import sample


@pytest.fixture
def catalogue(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/catalogue.sqlite"
    monkeypatch.setenv("UNIFR_DATABASE_URL", url)
    engine = create_engine(url)
    metadata.create_all(engine)
    repo = SqlCatalogueRepository(engine, allow_sqlite=True)
    yield TestClient(app), repo
    engine.dispose()


def publish(repo, *, age=0, empty=False):
    snap, report = sample("api-snapshot")
    original = snap.offerings[0].model_dump()
    values = []
    entries = []
    for index, (name, faculty, lang, level, ects, hour) in enumerate(
        [
            ("Algebra", "Science", "de", "Bachelor", 6, 10),
            ("Écologie", "Arts", "fr", "Master", 9, 14),
            ("Unpublished", "Science", "en", "Doctorate", None, None),
        ]
        if not empty
        else []
    ):
        code, source_id = f"C{index + 1}", f"{9001 + index}"
        data = dict(
            original,
            source_id=source_id,
            course={"code": code, "titles": {"en": name, "de": name, "fr": name}},
            faculty_domain=faculty,
            languages=(lang,),
            levels=(level,),
            ects=ects,
            terms=("AS-2026",) if index != 1 else ("SS-2027",),
            meetings=(Meeting(unresolved=True, note="Times unpublished"),)
            if hour is None
            else (
                Meeting(
                    starts_at=datetime(2026, 9, 21, hour, tzinfo=timezone.utc),
                    ends_at=datetime(2026, 9, 21, hour + 1, tzinfo=timezone.utc),
                ),
            ),
        )
        values.append(type(snap.offerings[0]).model_validate(data))
        entries.append(
            snap.pages[0]
            .entries[0]
            .model_copy(
                update={
                    "code": code,
                    "source_id": source_id,
                    "terms": data["terms"],
                    "detail_url": f"https://www.unifr.ch/timetable/en/course.html?show={source_id}",
                }
            )
        )
    snap = snap.model_copy(
        update={
            "reported_count": len(values),
            "offerings": tuple(values),
            "pages": (
                snap.pages[0].model_copy(
                    update={"reported_count": len(values), "entries": tuple(entries)}
                ),
            ),
        }
    )
    report = report.model_copy(
        update={
            "reported_count": len(values),
            "parsed_count": len(values),
            "completed_at": datetime.now(timezone.utc) - timedelta(days=age),
        }
    )
    repo.stage(snap, report)
    with repo.lock():
        repo.publish(snap, report)


@pytest.mark.parametrize(
    "query, expected",
    [
        ("q=éCOLOGIE", ["C2"]),
        ("q=%25", []),
        ("term=AS-2026", ["C1", "C3"]),
        ("faculty=Science", ["C1", "C3"]),
        ("language=fr", ["C2"]),
        ("level=Bachelor", ["C1"]),
        ("ects_min=7&ects_max=9", ["C2"]),
        ("available_day=0&available_from=12:00&available_until=13:00", ["C1"]),
        ("available_day=0&available_from=08:00&available_until=18:00", ["C1", "C2"]),
        ("available_day=1&available_from=08:00&available_until=18:00", []),
        ("faculty=Science&language=de&level=Bachelor&ects_max=6", ["C1"]),
    ],
)
def test_filters_use_published_data(catalogue, query, expected):
    client, repo = catalogue
    publish(repo)
    response = client.get(f"/api/v1/catalogue/courses?{query}")
    assert response.status_code == 200, response.text
    assert [course["code"] for course in response.json()["items"]] == expected


def test_real_public_html_languages_are_usable_filter_values(catalogue):
    client, repo = catalogue
    snap, report = sample()
    repo.stage(snap, report)
    with repo.lock():
        repo.publish(snap, report)
    terms = client.get("/api/v1/catalogue/terms").json()
    assert set(terms["languages"]) == {"de", "fr"}
    for language in terms["languages"]:
        response = client.get("/api/v1/catalogue/courses", params={"language": language})
        assert response.status_code == 200
        assert response.json()["total"] == 1


@pytest.mark.parametrize(
    "query",
    [
        "limit=0",
        "limit=101",
        "offset=-1",
        "ects_min=-1",
        "ects_min=9&ects_max=6",
        "available_day=7",
        "available_from=25:00",
        "available_day=0",
        "available_day=0&available_from=13:00&available_until=12:00",
        "q=" + "x" * 201,
        "unexpected=value",
        "language=invalid",
    ],
)
def test_invalid_filters_are_rejected(catalogue, query):
    assert catalogue[0].get(f"/api/v1/catalogue/courses?{query}").status_code == 422


def test_pagination_and_details_preserve_source_and_unresolved_state(catalogue):
    client, repo = catalogue
    publish(repo)
    data = client.get("/api/v1/catalogue/courses?limit=1&offset=1").json()
    assert data["total"] == 3
    assert [course["code"] for course in data["items"]] == ["C2"]
    assert client.get("/api/v1/catalogue/courses?offset=3").json()["items"] == []
    course = client.get("/api/v1/catalogue/courses/C3").json()
    offering = course["offerings"][0]
    assert offering["source_url"] == "https://www.unifr.ch/timetable/en/course.html?show=9003"
    assert offering["meeting_state"] == "unresolved"
    assert offering["meetings"][0]["starts_at"] is None
    assert client.get("/api/v1/catalogue/courses/missing").status_code == 404
    assert client.get("/api/v1/catalogue/terms").json()["terms"] == ["AS-2026", "SS-2027"]


def test_empty_catalogue_is_different_from_unavailable(catalogue):
    client, repo = catalogue
    assert client.get("/api/v1/catalogue/courses").status_code == 503
    assert client.get("/api/v1/status/catalogue").json()["availability"] == "unavailable"
    publish(repo, empty=True)
    assert client.get("/api/v1/catalogue/courses").json()["total"] == 0
    assert client.get("/api/v1/status/catalogue").json()["availability"] == "available"


@pytest.mark.parametrize("has_snapshot", [False, True])
def test_rejected_sync_never_becomes_searchable_and_stale_age_is_explicit(catalogue, has_snapshot):
    client, repo = catalogue
    if has_snapshot:
        publish(repo, age=3)
    rejected = CatalogueSnapshot(
        snapshot_id="rejected", reported_count=3660, pages=(), offerings=()
    )
    report = SyncReport(
        snapshot_id="rejected",
        published=False,
        outcome="rejected_due_to_source_change",
        reported_count=3660,
        parsed_count=0,
        pages_fetched=2,
        completed_at=datetime.now(timezone.utc),
    )
    repo.stage(rejected, report)
    data = client.get("/api/v1/status/catalogue").json()
    assert data["latest_sync_outcome"] == "rejected_due_to_source_change"
    assert data["availability"] == ("available" if has_snapshot else "unavailable")
    assert data["snapshot_id"] == ("api-snapshot" if has_snapshot else None)
    if has_snapshot:
        assert data["stale"] is True
        assert data["age_seconds"] >= 3 * 86400
        assert client.get("/api/v1/catalogue/courses").json()["total"] == 3
    else:
        assert client.get("/api/v1/catalogue/courses").status_code == 503


def test_database_failure_is_an_explicit_unavailable_status(catalogue, monkeypatch):
    monkeypatch.setenv("UNIFR_DATABASE_URL", "sqlite:////missing-path/catalogue.sqlite")
    response = catalogue[0].get("/api/v1/status/catalogue")
    assert response.status_code == 200
    assert response.json()["availability"] == "unavailable"
    assert response.json()["reason"] == "database_unavailable"


def test_importer_retains_source_levels():
    assert sample()[0].offerings[0].model_dump().get("levels") == ("Master", "Préalable master")


def test_exact_detail_is_not_hidden_by_search_pagination(catalogue):
    client, repo = catalogue
    snap, report = sample("many-matches")
    records, entries = [], []
    for index in range(105):
        code = f"A{index:03}" if index < 104 else "Z"
        records.append(
            snap.offerings[0].model_copy(
                update={
                    "source_id": str(index),
                    "course": snap.offerings[0].course.model_copy(
                        update={"code": code, "titles": {"en": "Z"}}
                    ),
                }
            )
        )
        entries.append(
            snap.pages[0].entries[0].model_copy(update={"source_id": str(index), "code": code})
        )
    snap = snap.model_copy(
        update={
            "reported_count": 105,
            "offerings": tuple(records),
            "pages": (
                snap.pages[0].model_copy(
                    update={"reported_count": 105, "page_size": 105, "entries": tuple(entries)}
                ),
            ),
        }
    )
    report = report.model_copy(update={"reported_count": 105, "parsed_count": 105})
    repo.stage(snap, report)
    with repo.lock():
        repo.publish(snap, report)
    assert client.get("/api/v1/catalogue/courses/Z").status_code == 200


def test_time_filter_does_not_round_away_seconds(catalogue):
    client, repo = catalogue
    snap, report = sample("seconds")
    session = Meeting(
        starts_at=datetime(2026, 9, 21, 10, tzinfo=timezone.utc),
        ends_at=datetime(2026, 9, 21, 11, 0, 1, tzinfo=timezone.utc),
    )
    snap = snap.model_copy(
        update={"offerings": (snap.offerings[0].model_copy(update={"meetings": (session,)}),)}
    )
    repo.stage(snap, report)
    with repo.lock():
        repo.publish(snap, report)
    response = client.get(
        "/api/v1/catalogue/courses?available_day=0&available_from=12:00&available_until=13:00"
    )
    assert response.json()["total"] == 0


@pytest.mark.parametrize(
    "path, status_code",
    [
        ("/api/v1/catalogue/courses", "503"),
        ("/api/v1/catalogue/terms", "503"),
        ("/api/v1/catalogue/courses/{course_code}", "503"),
        ("/api/v1/catalogue/courses/{course_code}", "404"),
    ],
)
def test_openapi_declares_catalogue_error_response_bodies(path, status_code):
    contract = app.openapi()
    responses = contract["paths"][path]["get"]["responses"]
    assert status_code in responses, f"Undocumented {status_code} response for {path}"
    schema = responses[status_code]["content"]["application/json"]["schema"]
    model = contract["components"]["schemas"][schema["$ref"].rsplit("/", 1)[1]]
    assert model["properties"]["detail"]["type"] == "string"
    assert "detail" in model["required"]


def test_status_and_facets_never_validate_snapshot_or_offerings(catalogue, monkeypatch):
    from unifr_ingest.models import Offering

    client, repo = catalogue
    publish(repo)

    def forbidden(*args, **kwargs):
        raise AssertionError("read metadata must not materialize catalogue models")

    monkeypatch.setattr(CatalogueSnapshot, "model_validate", forbidden)
    monkeypatch.setattr(Offering, "model_validate", forbidden)
    assert client.get("/api/v1/status/catalogue").json()["snapshot_id"] == "api-snapshot"
    assert client.get("/api/v1/catalogue/terms").json()["terms"] == ["AS-2026", "SS-2027"]


def test_discovery_is_term_scoped_and_saved_codes_are_exact(catalogue):
    client, repo = catalogue
    publish(repo)
    assert client.get("/api/v1/catalogue/discovery").status_code == 422
    response = client.get("/api/v1/catalogue/discovery?term=AS-2026&limit=1&offset=100")
    assert response.status_code == 200
    assert [item["code"] for item in response.json()["items"]] == ["C1", "C3"]
    assert response.json()["items"][0]["offerings"][0]["snapshot_id"] == "api-snapshot"
    response = client.get("/api/v1/catalogue/courses?codes=C2,C3")
    assert [item["code"] for item in response.json()["items"]] == ["C2", "C3"]
    assert client.get("/api/v1/catalogue/courses?codes=c2").json()["items"] == []
    assert (
        client.get(
            "/api/v1/catalogue/courses", params={"codes": ",".join(str(i) for i in range(101))}
        ).status_code
        == 422
    )


def test_saved_codes_use_only_documented_academic_prefix_alias(catalogue):
    client, repo = catalogue
    snap, report = sample("canonical-code")
    original = snap.offerings[0]
    code = "UE-SIN.01023"
    snap = snap.model_copy(
        update={
            "offerings": (
                original.model_copy(
                    update={"course": original.course.model_copy(update={"code": code})}
                ),
            ),
            "pages": (
                snap.pages[0].model_copy(
                    update={
                        "entries": (snap.pages[0].entries[0].model_copy(update={"code": code}),)
                    }
                ),
            ),
        }
    )
    repo.stage(snap, report)
    with repo.lock():
        repo.publish(snap, report)
    for query in ("SIN.01023", "UE-SIN.01023"):
        response = client.get("/api/v1/catalogue/courses", params={"codes": query})
        assert [item["code"] for item in response.json()["items"]] == [code]
    assert client.get("/api/v1/catalogue/courses", params={"codes": "SIN.010"}).json()["total"] == 0
