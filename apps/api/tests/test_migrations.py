from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine


def test_baseline_migration_roundtrip(tmp_path, monkeypatch):
    config = Config("alembic.ini")
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_current_head() == "0006_catalogue_read"
    url = f"sqlite:///{tmp_path}/migration.sqlite"
    monkeypatch.setenv("UNIFR_DATABASE_URL", url)
    command.upgrade(config, "head")
    engine = create_engine(url)
    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == "0006_catalogue_read"
        from sqlalchemy import inspect

        assert "catalogue_offering" in inspect(connection).get_table_names()
        assert "catalogue_plan_change" in inspect(connection).get_table_names()
        assert "sharing_plan" in inspect(connection).get_table_names()
        assert "sharing_rate_limit" in inspect(connection).get_table_names()
    command.downgrade(config, "base")
    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() is None
    engine.dispose()


def test_migration_autogeneration_recognizes_catalogue_tables(tmp_path):
    import os
    import subprocess

    env = {
        **os.environ,
        "PYTHONPATH": "apps/api:packages/ingest/src",
        "UNIFR_DATABASE_URL": f"sqlite:///{tmp_path}/check.sqlite",
    }
    subprocess.run(
        [".venv/bin/alembic", "upgrade", "head"],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    result = subprocess.run([".venv/bin/alembic", "check"], env=env, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
