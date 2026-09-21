"""Atomic, verified pg_dump restore points. Passwords never enter process arguments."""

import argparse
from collections.abc import Callable
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory

from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.engine import make_url

from .config import Settings


def pg_environment(url: str) -> dict[str, str]:
    parsed = make_url(url)
    if parsed.get_backend_name() != "postgresql":
        raise ValueError("PostgreSQL required")
    return {
        **os.environ,
        "PGHOST": parsed.host or "localhost",
        "PGPORT": str(parsed.port or 5432),
        "PGDATABASE": parsed.database or "",
        "PGUSER": parsed.username or "",
        "PGPASSWORD": parsed.password or "",
        "PGCONNECT_TIMEOUT": "10",
        "PGSSLMODE": str(parsed.query.get("sslmode", "prefer")),
    }


def command(args: list[str], url: str | None = None) -> None:
    try:
        subprocess.run(
            args,
            env=pg_environment(url) if url else None,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=3600,
        )
    except (subprocess.SubprocessError, OSError):
        # Driver/CLI messages can include credentials, so keep only the command identity.
        raise RuntimeError(f"{args[0]} failed") from None


def dump_archive(path: Path, url: str) -> None:
    command(["pg_dump", "--format=custom", "--no-owner", "--no-acl", "--file", str(path)], url)


def validate_archive(path: Path) -> None:
    command(["pg_restore", "--list", str(path)])
    # Read/decompress every data block as well as the archive table of contents.
    command(["pg_restore", "--file=/dev/null", str(path)])


def checksum(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify(path: Path) -> bool:
    expected = path.with_suffix(".sha256").read_text().strip()
    if checksum(path) != expected:
        raise ValueError("Backup checksum mismatch")
    return True


def backup(
    root: Path,
    url: str,
    now: datetime,
    *,
    dump: Callable[[Path, str], object] = dump_archive,
    validate: Callable[[Path], object] = validate_archive,
) -> Path:
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    day = now.strftime("%Y-%m-%d")
    week = now.strftime("%G-W%V")
    destination = root / "daily" / f"{day}.dump"
    with TemporaryDirectory(prefix=".pending-", dir=root) as temporary:
        pending = Path(temporary) / "backup.dump"
        dump(pending, url)
        pending.chmod(0o600)
        validate(pending)
        digest = checksum(pending)
        for kind, key in (("daily", day), ("weekly", week)):
            directory = root / kind
            directory.mkdir(exist_ok=True, mode=0o700)
            target = directory / f"{key}.dump"
            # Immutable daily/weekly restore points: never overwrite known good data.
            if target.exists():
                verify(target)
                continue
            staged = Path(temporary) / f"{kind}.dump"
            shutil.copyfile(pending, staged)
            staged.chmod(0o600)
            with staged.open("rb") as stream:
                os.fsync(stream.fileno())
            sidecar = Path(temporary) / f"{kind}.sha256"
            sidecar.write_text(digest + "\n")
            sidecar.chmod(0o600)
            with sidecar.open("rb") as stream:
                os.fsync(stream.fileno())
            os.replace(sidecar, target.with_suffix(".sha256"))
            os.replace(staged, target)
            descriptor = os.open(directory, os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        # Rotation happens only after the new archive and both checksums are durable.
        for kind, keep in (("daily", 7), ("weekly", 4)):
            for old in sorted((root / kind).glob("*.dump"), reverse=True)[keep:]:
                old.unlink()
                old.with_suffix(".sha256").unlink(missing_ok=True)
    return destination


def assert_empty(engine: Engine) -> None:
    if engine.dialect.name == "postgresql":
        with engine.connect() as connection:
            count = connection.scalar(
                text(
                    "SELECT count(*) FROM pg_class c JOIN pg_namespace n "
                    "ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') "
                    "AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','v','m','S','f','p')"
                )
            )
        if count:
            raise ValueError("Restore target must be empty")
    elif inspect(engine).get_table_names():
        raise ValueError("Restore target must be empty")


def restore(path: Path, url: str) -> None:
    verify(path)
    validate_archive(path)
    engine = create_engine(url)
    try:
        assert_empty(engine)
        command(
            [
                "pg_restore",
                "--exit-on-error",
                "--single-transaction",
                "--no-owner",
                "--no-acl",
                "--dbname",
                make_url(url).database or "",
                str(path),
            ],
            url,
        )
    finally:
        engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("backup", "restore", "verify"))
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    settings = Settings()
    if args.action == "backup":
        print(backup(settings.backup_dir, settings.database_url, datetime.now(timezone.utc)))
    elif args.archive is None:
        parser.error("--archive is required")
    elif args.action == "restore":
        restore(args.archive, settings.database_url)
        print("Restored verified archive into empty database")
    else:
        verify(args.archive)
        validate_archive(args.archive)
        print("Checksum and archive integrity verified")


if __name__ == "__main__":
    main()
