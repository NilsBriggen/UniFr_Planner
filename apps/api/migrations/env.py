from alembic import context
from sqlalchemy import create_engine

from unifr_api.config import Settings
from unifr_api.catalogue import metadata
from unifr_api import account_repository  # noqa: F401 -- register account tables
from unifr_api import operations  # noqa: F401 -- register operations tables
from unifr_api import sharing  # noqa: F401 -- register sharing tables

url = Settings().database_url
if context.is_offline_mode():
    context.configure(url=url, target_metadata=metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
