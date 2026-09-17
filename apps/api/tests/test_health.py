from fastapi.testclient import TestClient

from unifr_api.main import app


def test_health_is_available_without_database_or_login():
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "unifr-planner"}


def test_readiness_connects_to_database(monkeypatch):
    monkeypatch.setenv("UNIFR_DATABASE_URL", "sqlite://")
    with TestClient(app) as client:
        response = client.get("/api/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_readiness_reports_unavailable_database_without_details(monkeypatch):
    monkeypatch.setenv("UNIFR_DATABASE_URL", "sqlite:////does-not-exist/unifr.sqlite")
    with TestClient(app) as client:
        response = client.get("/api/ready")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}
