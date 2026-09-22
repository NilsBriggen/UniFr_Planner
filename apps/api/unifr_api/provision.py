"""One-shot bootstrap migrations and explicit, non-owning runtime grants."""

import os

from alembic import command
from alembic.config import Config
import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

from .config import Settings
from .operations import event


def provision(
    url: str,
    api_password: str,
    scheduler_password: str,
    *,
    api_role: str = "unifr_api",
    scheduler_role: str = "unifr_scheduler",
) -> None:
    parsed = make_url(url)
    if len({parsed.username, api_role, scheduler_role}) != 3:
        raise ValueError("Bootstrap and runtime roles must be distinct")
    if min(len(api_password), len(scheduler_password)) < 16 or api_password == scheduler_password:
        raise ValueError("Independent runtime passwords of at least 16 characters required")
    with psycopg.connect(
        parsed.set(drivername="postgresql").render_as_string(hide_password=False)
    ) as connection:
        # Serializes repeated deployments. Runtime roles never own the database,
        # schema, tables or sequences and cannot inherit another role's powers.
        connection.execute("SELECT pg_advisory_xact_lock(854712093)")
        database = sql.Identifier(parsed.database or "")
        for role, password in ((api_role, api_password), (scheduler_role, scheduler_password)):
            identifier = sql.Identifier(role)
            existing = connection.execute(
                "SELECT oid, rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=%s",
                (role,),
            ).fetchone()
            if existing:
                memberships = connection.execute(
                    "SELECT 1 FROM pg_auth_members WHERE member=%s", (existing[0],)
                ).fetchone()
                owns = connection.execute(
                    "SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=%s AND deptype='o' LIMIT 1",
                    (existing[0],),
                ).fetchone()
                if existing[1] or memberships or owns:
                    raise ValueError("Existing runtime role has unexpected privileges or ownership")
            else:
                connection.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(identifier))
            connection.execute(
                sql.SQL(
                    "ALTER ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD {}"
                ).format(identifier, sql.Literal(password))
            )
            connection.execute(
                sql.SQL("REVOKE ALL ON DATABASE {} FROM {}").format(database, identifier)
            )
            connection.execute(
                sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(database, identifier)
            )
            connection.execute(sql.SQL("REVOKE ALL ON SCHEMA public FROM {}").format(identifier))
            connection.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(identifier))
            connection.execute(
                sql.SQL("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {}").format(identifier)
            )
            connection.execute(
                sql.SQL("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {}").format(identifier)
            )
        connection.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(database))
        connection.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
        tables = connection.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname='public'"
        ).fetchall()
        for (table,) in tables:
            if (
                not table.startswith(("account_", "catalogue_", "operations_", "sharing_"))
                and table != "alembic_version"
            ):
                continue
            for role in (api_role, scheduler_role):
                if (
                    role == api_role
                    and not table.startswith(("account_", "sharing_"))
                    and table
                    not in {
                        "catalogue_snapshot",
                        "catalogue_head",
                        "catalogue_offering",
                        "catalogue_read_generation",
                        "catalogue_read_offering",
                        "catalogue_read_facet",
                        "operations_run",
                        "operations_state",
                    }
                ):
                    continue
                writes = (role == api_role and table.startswith(("account_", "sharing_"))) or (
                    role == scheduler_role and table.startswith(("catalogue_", "operations_"))
                )
                privilege = sql.SQL("SELECT, INSERT, UPDATE, DELETE" if writes else "SELECT")
                connection.execute(
                    sql.SQL("GRANT {} ON TABLE public.{} TO {}").format(
                        privilege, sql.Identifier(table), sql.Identifier(role)
                    )
                )
                if writes:
                    sequences = connection.execute(
                        "SELECT s.relname FROM pg_class s JOIN pg_depend d ON d.objid=s.oid "
                        "JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace n ON n.oid=t.relnamespace "
                        "WHERE s.relkind='S' AND n.nspname='public' AND t.relname=%s AND d.deptype IN ('a','i')",
                        (table,),
                    ).fetchall()
                    for (sequence,) in sequences:
                        connection.execute(
                            sql.SQL("GRANT USAGE, SELECT ON SEQUENCE public.{} TO {}").format(
                                sql.Identifier(sequence), sql.Identifier(role)
                            )
                        )


def main() -> None:
    try:
        command.upgrade(Config("alembic.ini"), "head")
        provision(
            Settings().database_url,
            os.environ["API_DB_PASSWORD"],
            os.environ["SCHEDULER_DB_PASSWORD"],
        )
    except Exception as error:
        # SQL/driver exceptions can contain a password literal or connection URL.
        event("provision_failed", reason=type(error).__name__)
        raise SystemExit(1) from None
    event("runtime_roles_provisioned")


if __name__ == "__main__":
    main()
