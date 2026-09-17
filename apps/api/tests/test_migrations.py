from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine


def test_baseline_migration_roundtrip(tmp_path, monkeypatch):
    config = Config("alembic.ini")
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_current_head() == "0001_baseline"
    url = f"sqlite:///{tmp_path}/migration.sqlite"
    monkeypatch.setenv("UNIFR_DATABASE_URL", url)
    command.upgrade(config, "head")
    engine = create_engine(url)
    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == "0001_baseline"
    command.downgrade(config, "base")
    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() is None
    engine.dispose()
