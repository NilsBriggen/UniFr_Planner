"""Operations contracts: fail closed, durable due times and recoverable backups."""

import importlib.util
from datetime import datetime, timedelta, timezone
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

from unifr_api.main import app


def ops():
    assert importlib.util.find_spec("unifr_api.operations"), "Operations implementation missing"
    from unifr_api import operations

    return operations


def test_admin_is_disabled_and_does_not_disclose_state(monkeypatch):
    monkeypatch.delenv("UNIFR_ADMIN_TOKEN", raising=False)
    response = TestClient(app).get("/api/v1/admin/operations")
    assert response.status_code == 503
    assert response.json() == {"detail": "Administration disabled"}


def test_admin_auth_and_request_logs_never_echo_secrets(monkeypatch, capfd):
    monkeypatch.setenv("UNIFR_ADMIN_TOKEN", "x" * 40)
    response = TestClient(app).get(
        "/api/v1/admin/operations?token=private-query",
        headers={"Authorization": "Bearer secret-password", "X-Request-ID": "private-id"},
    )
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-request-id"] != "private-id"
    logs = capfd.readouterr().err
    assert "http_request" in logs
    assert all(value not in logs for value in ("private-query", "secret-password", "private-id"))


def test_structured_event_reaches_runtime_stderr(capfd):
    module = ops()
    module.event("runtime_probe", request_id="generated-id", status=200)
    record = json.loads(capfd.readouterr().err.strip())
    assert record == {"event": "runtime_probe", "request_id": "generated-id", "status": 200}


def test_zurich_schedule_survives_dst_and_has_weekly_document_check():
    module = ops()
    assert module.next_due("catalogue", datetime(2026, 3, 28, 5, tzinfo=timezone.utc)) == datetime(
        2026, 3, 29, 3, tzinfo=timezone.utc
    )
    assert module.next_due("catalogue", datetime(2026, 10, 24, 5, tzinfo=timezone.utc)) == datetime(
        2026, 10, 25, 4, tzinfo=timezone.utc
    )
    due = module.next_due("documents", datetime(2026, 9, 18, tzinfo=timezone.utc))
    assert due == datetime(2026, 9, 21, 2, 30, tzinfo=timezone.utc)


def test_due_run_is_recorded_after_boundary_and_not_repeated():
    module = ops()
    engine = create_engine("sqlite://")
    module.metadata.create_all(engine)
    before = datetime(2026, 9, 19, 2, 59, 59, tzinfo=timezone.utc)
    calls = []
    module.tick(
        engine, before, lambda job: calls.append(job) or {"outcome": "success"}, allow_sqlite=True
    )
    assert calls == []
    module.tick(
        engine,
        before + timedelta(seconds=2),
        lambda job: calls.append(job) or {"outcome": "success"},
        allow_sqlite=True,
    )
    module.tick(
        engine,
        before + timedelta(seconds=3),
        lambda job: calls.append(job) or {},
        allow_sqlite=True,
    )
    assert calls == ["catalogue"]
    with engine.connect() as connection:
        row = connection.execute(select(module.runs)).mappings().one()
    assert row["outcome"] == "success"
    assert row["due_at"] <= row["started_at"]


def test_failure_is_durable_redacted_and_blocks_sync_after_backup_failure(tmp_path):
    module = ops()
    called = []

    def fail():
        raise RuntimeError("postgres://secret-password")

    with pytest.raises(RuntimeError):
        module.catalogue_job(fail, lambda: called.append("sync"))
    assert called == []
    engine = create_engine("sqlite://")
    module.metadata.create_all(engine)
    now = datetime(2026, 9, 19, 2, 59, 59, tzinfo=timezone.utc)
    module.tick(engine, now, lambda _: {}, allow_sqlite=True)
    module.tick(engine, now + timedelta(seconds=2), lambda _: fail(), allow_sqlite=True)
    with engine.connect() as connection:
        row = connection.execute(select(module.runs)).mappings().one()
    assert row["outcome"] == "failure"
    assert "secret-password" not in str(row)


def test_document_change_flags_review_and_never_rebaselines():
    module = ops()
    import hashlib

    document = {
        "id": "curriculum",
        "url": "https://example.invalid/curriculum.pdf",
        "sha256": hashlib.sha256(b"original").hexdigest(),
    }
    assert module.check_documents([document], lambda _: b"original")["outcome"] == "success"
    result = module.check_documents([document], lambda _: b"changed")
    assert result["outcome"] == "rejected"
    assert result["documents"][0]["status"] == "changed_review_required"
    assert document["sha256"] == hashlib.sha256(b"original").hexdigest()
    assert module.check_documents([], lambda _: b"")["outcome"] == "failure"


def test_monitor_reports_disk_db_and_missing_backup_as_failure():
    module = ops()
    result = module.assess_monitor(
        free_bytes=10, database_bytes=200, database_limit=100, latest_backup=None
    )
    assert set(result["alerts"]) == {"disk_low", "database_large", "backup_missing_or_stale"}
    assert result["outcome"] == "failure"


def backup_module():
    assert importlib.util.find_spec("unifr_api.backups"), "Backup implementation missing"
    from unifr_api import backups

    return backups


def test_backup_rotation_keeps_seven_days_and_four_weekly_points(tmp_path):
    module = backup_module()
    for day in range(40):
        now = datetime(2026, 8, 1, tzinfo=timezone.utc) + timedelta(days=day)
        module.backup(
            tmp_path,
            "postgresql://unused",
            now,
            dump=lambda path, _: path.write_bytes(b"archive"),
            validate=lambda _: None,
        )
    assert len(list((tmp_path / "daily").glob("*.dump"))) == 7
    assert len(list((tmp_path / "weekly").glob("*.dump"))) == 4
    for path in tmp_path.glob("*/*.dump"):
        assert module.verify(path)


def test_failed_dump_or_integrity_preserves_previous_backups(tmp_path):
    module = backup_module()
    now = datetime(2026, 9, 1, tzinfo=timezone.utc)
    module.backup(
        tmp_path,
        "postgresql://unused",
        now,
        dump=lambda path, _: path.write_bytes(b"good"),
        validate=lambda _: None,
    )
    original = {str(p): p.read_bytes() for p in tmp_path.glob("*/*")}

    def fail(path):
        raise RuntimeError("invalid archive")

    with pytest.raises(RuntimeError):
        module.backup(
            tmp_path,
            "postgresql://unused",
            now + timedelta(days=1),
            dump=lambda path, _: path.write_bytes(b"bad"),
            validate=fail,
        )
    assert original == {str(p): p.read_bytes() for p in tmp_path.glob("*/*")}
    path = next(tmp_path.glob("daily/*.dump"))
    path.write_bytes(b"corrupted")
    with pytest.raises(ValueError, match="checksum"):
        module.verify(path)


def test_restore_refuses_nonempty_target_before_running_restore(tmp_path):
    module = backup_module()
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        from sqlalchemy import text

        connection.execute(text("CREATE TABLE existing (id INTEGER)"))
    with pytest.raises(ValueError, match="empty"):
        module.assert_empty(engine)


def test_alert_hook_local_positive_control_and_failed_delivery():
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from threading import Thread
    import json

    module = ops()
    received = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            received.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(204)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        payload = {"event": "monitor", "alerts": ["disk_low"]}
        assert module.send_alert(f"http://127.0.0.1:{server.server_port}/", payload) == "delivered"
        assert received == [payload]
    finally:
        server.shutdown()
        server.server_close()
        worker.join()
    assert module.send_alert("", {}) == "disabled"
    assert module.send_alert("http://127.0.0.1:1", {}) == "failed"
    with pytest.raises(ValueError):
        module.send_alert("http://external.invalid", {})


def test_scheduler_health_fails_for_missing_stale_or_malformed_heartbeat(tmp_path):
    assert importlib.util.find_spec("unifr_api.scheduler"), "Scheduler service missing"
    from unifr_api.scheduler import healthy
    import json

    assert not healthy(tmp_path)
    (tmp_path / "heartbeat.json").write_text("broken")
    assert not healthy(tmp_path)
    (tmp_path / "heartbeat.json").write_text(json.dumps({"at": "2020-01-01T00:00:00+00:00"}))
    assert not healthy(tmp_path)
    (tmp_path / "heartbeat.json").write_text(
        json.dumps({"at": datetime.now(timezone.utc).isoformat()})
    )
    assert healthy(tmp_path)


def test_admin_authenticated_status_exposes_history_without_config_secrets(monkeypatch, tmp_path):
    module = ops()
    url = f"sqlite:///{tmp_path / 'ops.db'}"
    engine = create_engine(url)
    module.metadata.create_all(engine)
    module.put_state(engine, "monitor", {"outcome": "failure", "alerts": ["disk_low"]})
    monkeypatch.setenv("UNIFR_DATABASE_URL", url)
    monkeypatch.setenv("UNIFR_ADMIN_TOKEN", "x" * 40)
    monkeypatch.setenv("UNIFR_ALERT_HOOK", "https://example.invalid/secret-hook")
    response = TestClient(app).get(
        "/api/v1/admin/operations", headers={"Authorization": "Bearer " + "x" * 40}
    )
    assert response.status_code == 200
    assert response.json()["state"]["monitor"]["alerts"] == ["disk_low"]
    assert "secret-hook" not in response.text
    assert response.headers["cache-control"] == "no-store"
