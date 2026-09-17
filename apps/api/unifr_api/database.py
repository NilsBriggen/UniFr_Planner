from sqlalchemy import MetaData, create_engine, text

from unifr_api.config import Settings

# Persistence metadata belongs to the API adapter, never to the pure domain package.
metadata = MetaData(
    naming_convention={
        "ix": "ix_%(column_0_label)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    }
)


def check_database() -> None:
    url = Settings().database_url
    engine = create_engine(
        url, connect_args={"connect_timeout": 3} if url.startswith("postgresql") else {}
    )
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    finally:
        engine.dispose()
