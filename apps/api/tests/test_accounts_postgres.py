"""Real migrated PostgreSQL concurrency controls, in a disposable schema."""

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateSchema, DropSchema

from unifr_api.account_repository import AccountRepository
from unifr_api.account_security import AccountError
from test_accounts import PASSWORD, plan
from test_account_domain import PARITY


@pytest.fixture
def repo(monkeypatch):
    url = os.environ.get("UNIFR_TEST_DATABASE_URL")
    if not url:
        pytest.skip("UNIFR_TEST_DATABASE_URL required for real PostgreSQL controls")
    admin = create_engine(url)
    schema = "account_test_" + uuid4().hex
    with admin.begin() as conn:
        conn.execute(CreateSchema(schema))
    isolated = make_url(url).update_query_dict({"options": f"-csearch_path={schema}"})
    monkeypatch.setenv("UNIFR_DATABASE_URL", isolated.render_as_string(hide_password=False))
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    engine = create_engine(isolated)
    try:
        yield AccountRepository(engine)
        command.downgrade(config, "base")
        assert "account_user" not in inspect(engine).get_table_names()
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(DropSchema(schema, cascade=True))
        admin.dispose()


def test_two_real_connections_keep_both_device_edits(repo):
    first, _ = repo.register("alice", PASSWORD)
    second = repo.login("alice", PASSWORD, None)
    imported = repo.import_plans(first, [plan()])[0]
    barrier = Barrier(2)

    def write(secret, minutes):
        snapshot = imported.model_copy(deep=True).snapshot
        snapshot["scenarios"][0]["travelMinutes"] = minutes
        barrier.wait()
        return repo.write_plan(secret, imported.id, 1, snapshot)

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda args: write(*args), [(first, 30), (second, 60)]))
    assert sum(r.conflict is not None for r in results) == 1
    snapshots = repo.list_plans(first)
    assert len(snapshots) == 2
    assert {p.snapshot["scenarios"][0]["travelMinutes"] for p in snapshots} == {30, 60}
    assert sorted(p.revision for p in snapshots) == [1, 2]


def test_simultaneous_recovery_is_once_and_revokes_both_devices(repo):
    first, code = repo.register("alice", PASSWORD)
    second = repo.login("alice", PASSWORD, None)
    barrier = Barrier(2)

    def recover():
        barrier.wait()
        try:
            return repo.recover("alice", code, PASSWORD + "new")
        except AccountError as error:
            assert error.status == 401
            return None

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: recover(), range(2)))
    assert sum(r is not None for r in results) == 1
    for secret in (first, second):
        with pytest.raises(AccountError, match="Authentication required"):
            repo.identity(secret)
    new_session = next(r[0] for r in results if r is not None)
    assert repo.identity(new_session) == "alice"


def test_parallel_rate_limits_cannot_overshoot_and_are_shared(repo):
    def attempt(_):
        try:
            repo.rate_limit("127.0.0.1", "alice")
            return True
        except AccountError as error:
            assert error.status == 429
            return False

    with ThreadPoolExecutor(12) as pool:
        assert sum(pool.map(attempt, range(12))) == 10


def test_cross_account_export_and_deletion_foreign_key_isolation(repo):
    alice, _ = repo.register("alice", PASSWORD)
    bob, _ = repo.register("bob", PASSWORD)
    alice_plan = repo.import_plans(alice, [plan()])[0]
    bob_plan = repo.import_plans(bob, [plan()])[0]
    with pytest.raises(AccountError) as denied:
        repo.write_plan(bob, alice_plan.id, 1, alice_plan.snapshot)
    assert denied.value.status == 404
    repo.delete_account(alice, PASSWORD)
    assert repo.export(bob).plans == [bob_plan]
    with pytest.raises(AccountError):
        repo.export(alice)


@pytest.mark.parametrize(
    "case", [c for c in PARITY["cases"] if not c["valid"]], ids=lambda case: case["name"]
)
def test_historical_invalid_snapshot_does_not_poison_postgres_account(repo, case):
    import json
    from sqlalchemy import update
    from unifr_api.account_repository import plans

    alice, _ = repo.register("alice", PASSWORD)
    good, bad = repo.import_plans(alice, [plan(), plan()])
    damaged = {**bad.snapshot, **case["patch"]}
    with repo.engine.begin() as conn:
        conn.execute(update(plans).where(plans.c.id == bad.id).values(snapshot=damaged))
    listing = repo.plan_listing(alice)
    assert listing.plans == [good]
    assert listing.unreadableIds == [bad.id]
    assert json.loads(repo.recover_snapshot(alice, bad.id).snapshotJson) == damaged
    assert repo.export(alice).plans == [good]
    assert repo.write_plan(alice, good.id, 1, good.snapshot).plan.revision == 2
    assert len(repo.import_plans(alice, [plan()])) == 1
    bob, _ = repo.register("bob", PASSWORD)
    with pytest.raises(AccountError) as denied:
        repo.recover_snapshot(bob, bad.id)
    assert denied.value.status == 404


def test_stale_account_binding_fails_inside_postgres_owner_transaction(repo):
    alice, _ = repo.register("alice", PASSWORD)
    bob, _ = repo.register("bob", PASSWORD)
    bound = AccountRepository(repo.engine, expected_owner=repo.account_identity(alice).accountId)
    with pytest.raises(AccountError) as denied:
        bound.import_plans(bob, [plan()])
    assert denied.value.status == 409
    assert repo.list_plans(bob) == []
