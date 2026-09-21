"""Shared links are readable capabilities, never editing capabilities."""

import copy
import json

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from unifr_api.main import app

ORIGIN = "https://planner.test"
KEY = "owner-" + "x" * 37
PASSWORD = "only for sharing tests 12345"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("UNIFR_DATABASE_URL", f"sqlite:///{tmp_path}/sharing.sqlite")
    monkeypatch.setenv("UNIFR_ACCOUNT_ORIGINS", json.dumps([ORIGIN]))
    command.upgrade(Config("alembic.ini"), "head")
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as value:
        yield value


def plan():
    return {
        "schemaVersion": 1,
        "id": "local-id-is-not-proof",
        "name": "CS semester",
        "programme": "CS + BI",
        "targetEcts": 180,
        "semesters": ["AS-2026"],
        "activeScenarioId": "main",
        "scenarios": [
            {"id": "main", "name": "Main", "courses": [], "unavailable": [], "travelMinutes": 0}
        ],
    }


def create(client):
    response = client.post("/api/v1/shares", json={"snapshot": plan(), "ownerKey": KEY})
    assert response.status_code == 201, response.text
    assert KEY not in response.text and "owner_hash" not in response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def test_read_link_cannot_edit_even_with_same_local_id_or_an_unrelated_account(client):
    shared = create(client)
    path = f"/api/v1/shares/{shared['id']}"
    public = client.get(path)
    assert public.status_code == 200 and public.json()["canManage"] is False
    body = {"snapshot": {**plan(), "name": "Tampered"}, "revision": 1}
    assert client.put(path, json=body).status_code == 403
    assert client.delete(path).status_code == 403
    assert (
        client.put(path, json=body, headers={"X-Unifr-Share-Key": shared["id"]}).status_code == 403
    )
    client.post("/api/v1/account/register", json={"username": "outsider", "password": PASSWORD})
    assert client.get(path).json()["canManage"] is False
    assert client.put(path, json=body).status_code == 403
    assert client.get(path).json()["snapshot"]["name"] == "CS semester"


def test_owner_updates_revision_revokes_and_retry_creation_keeps_one_link(client):
    shared = create(client)
    assert create(client)["id"] == shared["id"]
    path = f"/api/v1/shares/{shared['id']}"
    owner = {"X-Unifr-Share-Key": KEY}
    assert client.get(path, headers=owner).json()["canManage"] is True
    snapshot = {**plan(), "name": "Updated plan"}
    updated = client.put(path, json={"snapshot": snapshot, "revision": 1}, headers=owner)
    assert updated.status_code == 200 and updated.json()["revision"] == 2
    assert (
        client.put(path, json={"snapshot": plan(), "revision": 1}, headers=owner).status_code == 409
    )
    assert client.get(path).json()["snapshot"]["name"] == "Updated plan"
    assert client.delete(path, headers=owner).status_code == 204
    assert client.get(path).status_code == 404
    assert (
        client.put(path, json={"snapshot": snapshot, "revision": 2}, headers=owner).status_code
        == 404
    )


def test_only_original_authenticated_creator_can_edit_without_browser_secret(client):
    client.post("/api/v1/account/register", json={"username": "owner", "password": PASSWORD})
    shared = create(client)
    path = f"/api/v1/shares/{shared['id']}"
    client.post("/api/v1/account/logout")
    assert client.get(path).json()["canManage"] is False
    assert client.put(path, json={"snapshot": plan(), "revision": 1}).status_code == 403
    client.post("/api/v1/account/login", json={"username": "owner", "password": PASSWORD})
    assert client.get(path).json()["canManage"] is True
    assert client.put(path, json={"snapshot": plan(), "revision": 1}).status_code == 200
    assert client.delete(path).status_code == 204


def test_validation_origin_and_body_limits_do_not_echo_secrets(client):
    body = {"snapshot": plan(), "ownerKey": KEY}
    assert (
        client.post(
            "/api/v1/shares", json=body, headers={"Origin": "https://other.test"}
        ).status_code
        == 403
    )
    invalid = copy.deepcopy(body)
    invalid["snapshot"]["scenarios"][0]["courses"] = [{"private": "secret"}]
    response = client.post("/api/v1/shares", json=invalid)
    assert (
        response.status_code == 422 and "secret" not in response.text and KEY not in response.text
    )
    response = client.post("/api/v1/shares", content=b"x" * 6_000_001)
    assert response.status_code == 413
    assert client.get("/api/v1/shares/nonexistent").status_code == 404


def test_create_budget_is_separate_from_account_login(client):
    for i in range(10):
        assert (
            client.post(
                "/api/v1/shares", json={"snapshot": plan(), "ownerKey": str(i) * 43}
            ).status_code
            == 201
        )
    assert (
        client.post("/api/v1/shares", json={"snapshot": plan(), "ownerKey": KEY}).status_code == 429
    )
    assert (
        client.post(
            "/api/v1/account/register", json={"username": "fresh", "password": PASSWORD}
        ).status_code
        == 201
    )
