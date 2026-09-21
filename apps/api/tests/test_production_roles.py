"""Real PostgreSQL proof of idempotent runtime grants and forbidden escalation."""

import importlib.util
import os
from uuid import uuid4

import psycopg
from psycopg import sql
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url


def test_production_role_provisioner_exists():
    assert importlib.util.find_spec("unifr_api.provision"), "Runtime privilege boundary missing"


@pytest.fixture
def roles(monkeypatch):
    url = os.environ.get("UNIFR_TEST_DATABASE_URL")
    if not url:
        pytest.skip("UNIFR_TEST_DATABASE_URL required for PostgreSQL role controls")
    from unifr_api.provision import provision

    suffix = uuid4().hex[:16]
    database, api, scheduler = (f"{name}_{suffix}" for name in ("roles", "api", "scheduler"))
    admin_url = make_url(url)
    admin = psycopg.connect(
        admin_url.set(drivername="postgresql").render_as_string(hide_password=False),
        autocommit=True,
    )
    admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
    isolated = admin_url.set(database=database).render_as_string(hide_password=False)
    monkeypatch.setenv("UNIFR_DATABASE_URL", isolated)
    try:
        command.upgrade(Config("alembic.ini"), "head")
        for _ in range(2):
            provision(
                isolated,
                "api test password",
                "scheduler test password",
                api_role=api,
                scheduler_role=scheduler,
            )
        yield make_url(isolated), api, scheduler
    finally:
        admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(database)))
        for role in (api, scheduler):
            admin.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(role)))
        admin.close()


def runtime(url, role, password):
    return psycopg.connect(
        make_url(url)
        .set(drivername="postgresql", username=role, password=password)
        .render_as_string(hide_password=False),
        autocommit=True,
    )


def test_runtime_roles_can_operate_but_cannot_administer_or_cross_write(roles):
    url, api, scheduler = roles
    for role, password in ((api, "api test password"), (scheduler, "scheduler test password")):
        with runtime(url, role, password) as connection:
            attributes = connection.execute(
                "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=current_user"
            ).fetchone()
            assert attributes == (False,) * 5
            assert connection.execute("SELECT count(*) FROM catalogue_offering").fetchone() == (0,)
            assert (
                connection.execute("SELECT pg_database_size(current_database())").fetchone()[0] > 0
            )
            for forbidden in (
                "CREATE TABLE public.forbidden(id integer)",
                "CREATE TEMP TABLE forbidden(id integer)",
                "CREATE ROLE forbidden",
                "ALTER TABLE account_user ADD COLUMN forbidden integer",
                "UPDATE alembic_version SET version_num='broken'",
            ):
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    connection.execute(forbidden)
    with runtime(url, api, "api test password") as connection:
        for private_table in ("catalogue_source_cache", "alembic_version"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                connection.execute(
                    sql.SQL("SELECT * FROM {}").format(sql.Identifier(private_table))
                )
        connection.execute(
            "INSERT INTO account_user(id,username,password_hash,recovery_hash) VALUES ('proof','proof','hash','hash')"
        )
        connection.execute(
            "INSERT INTO sharing_plan(id,owner_hash,revision,snapshot,updated_at) VALUES ('share','owner',1,'{}','2026-09-21')"
        )
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            connection.execute("DELETE FROM catalogue_offering")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            connection.execute("DELETE FROM operations_state")
    with runtime(url, scheduler, "scheduler test password") as connection:
        assert connection.execute("SELECT id FROM account_user").fetchone() == ("proof",)
        assert connection.execute("SELECT id FROM sharing_plan").fetchone() == ("share",)
        connection.execute("DELETE FROM catalogue_offering")
        connection.execute("DELETE FROM operations_state")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            connection.execute("DELETE FROM account_user")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            connection.execute("DELETE FROM sharing_plan")
