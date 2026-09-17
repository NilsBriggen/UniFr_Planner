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
