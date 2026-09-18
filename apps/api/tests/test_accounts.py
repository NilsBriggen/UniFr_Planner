"""Account boundary tests through real HTTP and SQL (no auth mocks)."""

import copy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from unifr_api.main import app

ORIGIN = "https://planner.test"
PASSWORD = "a long unique passphrase 123"


def test_account_openapi_documents_cookie_auth_private_errors_and_conflicts():
    contract = app.openapi()
    assert contract["components"]["securitySchemes"]["PrivateSession"] == {
        "type": "apiKey",
        "in": "cookie",
        "name": "__Host-unifr_session",
    }
    write = contract["paths"]["/api/v1/account/plans/{identifier}"]["put"]
    assert write["security"] == [{"PrivateSession": []}]
    assert {"200", "401", "403", "409", "413", "429"} <= write["responses"].keys()


@pytest.fixture
def client(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config

    url = f"sqlite:///{tmp_path}/accounts.sqlite"
    monkeypatch.setenv("UNIFR_DATABASE_URL", url)
    monkeypatch.setenv("UNIFR_ACCOUNT_ORIGINS", '["https://planner.test"]')
    command.upgrade(Config("alembic.ini"), "head")
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as client:
        client.db_url = url
        yield client


def register(client, username="alice"):
    result = client.post(
        "/api/v1/account/register", json={"username": username, "password": PASSWORD}
    )
    assert result.status_code == 201, result.text
    return result.json()


def plan():
    return {
        "schemaVersion": 1,
        "id": "guest",
        "name": "Degree",
        "programme": "CS",
        "targetEcts": 180,
        "semesters": ["AS-2026"],
        "activeScenarioId": "s",
        "scenarios": [
            {"id": "s", "name": "Main", "courses": [], "unavailable": [], "travelMinutes": 0}
        ],
    }


def test_argon2_session_logout_and_no_secret_redisclosure(client):
    created = register(client)
    assert len(created["recoveryCode"]) >= 32
    cookie = client.cookies.get("__Host-unifr_session")
    assert cookie and len(cookie) >= 32
    current = client.get("/api/v1/account/session")
    assert current.json() == {"username": "alice"}
    assert "no-store" in current.headers["cache-control"]
    engine = create_engine(client.db_url)
    with engine.connect() as conn:
        account = conn.execute(text("select password_hash, recovery_hash from account_user")).one()
        session = conn.execute(text("select token_hash from account_session")).scalar_one()
    assert account.password_hash.startswith("$argon2id$")
    assert PASSWORD not in account.password_hash
    assert created["recoveryCode"] != account.recovery_hash
    assert session != cookie
    assert client.post("/api/v1/account/logout").status_code == 204
    client.cookies.set("__Host-unifr_session", cookie)
    assert client.get("/api/v1/account/session").status_code == 401


def test_cookie_origin_uniform_errors_and_recovery_revokes_all_sessions(client):
    created = register(client)
    cookie = client.cookies.get("__Host-unifr_session")
    response = client.post(
        "/api/v1/account/login", json={"username": "alice", "password": PASSWORD}
    )
    assert all(
        flag in response.headers["set-cookie"].lower()
        for flag in ("secure", "httponly", "samesite=strict", "path=/")
    )
    assert cookie != client.cookies.get("__Host-unifr_session")
    assert (
        client.post("/api/v1/account/logout", headers={"Origin": "https://evil.test"}).status_code
        == 403
    )
    for user in ("alice", "absent"):
        r = client.post(
            "/api/v1/account/login", json={"username": user, "password": "incorrect password"}
        )
        assert r.status_code == 401
        assert r.json() == {"detail": "Authentication failed"}
    restored = client.post(
        "/api/v1/account/recover",
        json={
            "username": "alice",
            "recoveryCode": created["recoveryCode"],
            "password": PASSWORD + "new",
        },
    )
    assert restored.status_code == 200
    assert restored.json()["recoveryCode"] != created["recoveryCode"]
    client.cookies.set("__Host-unifr_session", cookie)
    assert client.get("/api/v1/account/session").status_code == 401
    retry = client.post(
        "/api/v1/account/recover",
        json={"username": "alice", "recoveryCode": created["recoveryCode"], "password": PASSWORD},
    )
    assert retry.status_code == 401


def test_rate_limit_unknown_accounts_and_oversized_secret_redaction(client):
    for _ in range(10):
        assert (
            client.post(
                "/api/v1/account/login", json={"username": "absent", "password": PASSWORD}
            ).status_code
            == 401
        )
    response = client.post(
        "/api/v1/account/login", json={"username": "absent", "password": PASSWORD}
    )
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0
    secret = "SENSITIVE" * 100
    response = client.post("/api/v1/account/register", json={"username": "bob", "password": secret})
    assert response.status_code == 422
    assert secret not in response.text and "SENSITIVE" not in response.text


def test_origin_required_expiry_body_cap_and_invalid_recovery_are_private(client):
    created = register(client)
    client.headers.pop("Origin")
    assert client.post("/api/v1/account/logout").status_code == 403
    client.headers["Origin"] = ORIGIN
    assert client.post("/api/v1/account/register", content=b"x" * 4097).status_code == 413
    for username in ("alice", "nobody"):
        result = client.post(
            "/api/v1/account/recover",
            json={"username": username, "password": PASSWORD, "recoveryCode": "wrong" * 10},
        )
        assert result.status_code == 401 and result.json() == {"detail": "Authentication failed"}
        assert created["recoveryCode"] not in result.text
    with create_engine(client.db_url).begin() as conn:
        conn.execute(text("update account_session set expires_at=0"))
    assert client.get("/api/v1/account/session").status_code == 401


def test_guest_import_two_devices_conflicts_isolation_export_and_delete(client):
    register(client)
    a_cookie = client.cookies.get("__Host-unifr_session")
    original = plan()
    imported = client.post("/api/v1/account/plans/import", json={"plans": [original]}).json()[
        "plans"
    ][0]
    assert imported["id"] != original["id"]
    assert imported["revision"] == 1
    second = client.post("/api/v1/account/plans/import", json={"plans": [original]}).json()[
        "plans"
    ][0]
    assert second["id"] != imported["id"]
    changed = copy.deepcopy(imported["snapshot"])
    changed["scenarios"][0]["travelMinutes"] = 45
    path = f"/api/v1/account/plans/{imported['id']}"
    success = client.put(path, json={"revision": 1, "snapshot": changed})
    assert success.status_code == 200 and success.json()["plan"]["revision"] == 2
    stale = client.put(path, json={"revision": 1, "snapshot": imported["snapshot"]})
    assert stale.status_code == 409
    assert stale.json()["plan"]["snapshot"] == changed
    conflict = stale.json()["conflict"]
    assert conflict["id"] != imported["id"]
    assert conflict["snapshot"]["scenarios"][0]["travelMinutes"] == 0
    archive = client.get("/api/v1/account/export").json()
    assert archive["schemaVersion"] == 1 and len(archive["plans"]) == 3
    assert not any(
        secret in str(archive) for secret in (PASSWORD, "password_hash", "token_hash", "recovery")
    )
    # A separate device's cookie jar; preserve Alice's active session.
    client.cookies.clear()
    register(client, "bob")
    assert client.get("/api/v1/account/plans").json() == {"plans": []}
    assert client.put(path, json={"revision": 2, "snapshot": changed}).status_code == 404
    bob_cookie = client.cookies.get("__Host-unifr_session")
    client.cookies.clear()
    client.cookies.set("__Host-unifr_session", a_cookie)
    assert (
        client.request(
            "DELETE", "/api/v1/account", json={"password": "incorrect password"}
        ).status_code
        == 401
    )
    assert (
        client.request("DELETE", "/api/v1/account", json={"password": PASSWORD}).status_code == 204
    )
    assert client.get("/api/v1/account/session").status_code == 401
    client.cookies.clear()
    client.cookies.set("__Host-unifr_session", bob_cookie)
    assert client.get("/api/v1/account/session").json() == {"username": "bob"}
    with create_engine(client.db_url).connect() as conn:
        assert conn.execute(text("select count(*) from account_plan")).scalar_one() == 0
        assert conn.execute(text("select count(*) from account_user")).scalar_one() == 1


@pytest.mark.parametrize(
    "damage",
    [
        "unknown",
        "semester",
        "active",
        "duplicate",
        "busy",
        "whitespace",
        "unicode_id",
        "unicode_term",
        "utf16",
    ],
)
def test_plan_validation_rejects_guest_schema_violations(client, damage):
    register(client)
    value = plan()
    if damage == "unknown":
        value["transcript"] = "sensitive"
    elif damage == "semester":
        value["semesters"] = ["invalid"]
    elif damage == "active":
        value["activeScenarioId"] = "missing"
    elif damage == "duplicate":
        value["scenarios"] *= 2
    elif damage == "whitespace":
        value["name"] = "   "
    elif damage == "unicode_id":
        value["id"] = "é"
    elif damage == "unicode_term":
        value["semesters"] = ["AS-20２６"]
    elif damage == "utf16":
        value["name"] = "🍷" * 200
    else:
        value["scenarios"][0]["unavailable"] = [
            {
                "id": "b",
                "label": "Busy",
                "start": "2026-09-18T12:00:00Z",
                "end": "2026-09-18T10:00:00Z",
            }
        ]
    result = client.post("/api/v1/account/plans/import", json={"plans": [value]})
    assert result.status_code == 422
    assert client.get("/api/v1/account/plans").json() == {"plans": []}
