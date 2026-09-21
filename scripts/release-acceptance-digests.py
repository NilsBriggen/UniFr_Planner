"""Read-only, content-level comparison of source and restored planner databases.

Run with PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python
scripts/release-acceptance-digests.py --source-env SOURCE_DATABASE_URL
--restored-env RESTORED_DATABASE_URL. URLs are read from environment variables,
never printed. Run against a quiescent source or the backup's original snapshot;
concurrent writes after backup legitimately produce different digests.

The manifest covers every saved account-plan snapshot/revision/owner, catalogue
head, published snapshot, offerings, meetings, assignments, plan references and
change notifications. It deliberately excludes credentials, sessions, rate limits,
staging snapshots and operational job history. This is content evidence, not a
replacement for pg_restore checks or browser acceptance.
"""

import argparse
from copy import deepcopy
import hashlib
import json
import os
from typing import Any

from sqlalchemy import create_engine, select, text

from unifr_api.account_repository import plans
from unifr_api.catalogue import (
    assignments,
    changes,
    head,
    meetings,
    offerings,
    plan_choices,
    snapshots,
)


def canonical(value: Any) -> str:
    # Object/row order has no meaning; order inside plan/meeting arrays does.
    return json.dumps(
        value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False
    )


def digest(rows: list[dict[str, Any]]) -> dict[str, Any]:
    encoded = canonical(sorted(rows, key=canonical)).encode("utf8")
    return {"rows": len(rows), "sha256": hashlib.sha256(encoded).hexdigest()}


def capture(url: str) -> dict[str, Any]:
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            if engine.dialect.name == "postgresql":
                connection = connection.execution_options(isolation_level="REPEATABLE READ")
                connection.execute(text("SET TRANSACTION READ ONLY"))
            elif engine.dialect.name == "sqlite":
                connection.execute(text("PRAGMA query_only=ON"))
                connection.exec_driver_sql("BEGIN")
            else:
                raise ValueError("Only PostgreSQL and SQLite are supported")
            current = connection.execute(select(head)).mappings().all()
            if len(current) != 1:
                raise ValueError("Expected exactly one published catalogue head")
            snapshot_id = current[0]["snapshot_id"]
            statements = {
                "account_plans": select(plans),
                "catalogue_head": select(head),
                "published_snapshot": select(snapshots).where(snapshots.c.id == snapshot_id),
                "published_offerings": select(offerings).where(
                    offerings.c.snapshot_id == snapshot_id
                ),
                "published_meetings": select(meetings).where(meetings.c.snapshot_id == snapshot_id),
                "published_assignments": select(assignments).where(
                    assignments.c.snapshot_id == snapshot_id
                ),
                "plan_references": select(plan_choices),
                "plan_changes": select(changes),
            }
            content = {
                name: [dict(row) for row in connection.execute(statement).mappings()]
                for name, statement in statements.items()
            }
            if not content["account_plans"] or not content["published_offerings"]:
                raise ValueError(
                    "Acceptance requires nonempty account plans and published offerings"
                )
            if (
                len(content["published_snapshot"]) != 1
                or content["published_snapshot"][0]["status"] != "published"
            ):
                raise ValueError("Catalogue head does not resolve to a published snapshot")
            return {
                "schemaVersion": 1,
                "tables": {name: digest(rows) for name, rows in content.items()},
            }
    finally:
        engine.dispose()


def self_test() -> None:
    original = [
        {"id": "plan", "snapshot": {"courses": [{"id": "course", "ects": 6, "pinned": True}]}}
    ]
    reordered = [
        {"snapshot": {"courses": [{"pinned": True, "ects": 6, "id": "course"}]}, "id": "plan"}
    ]
    assert digest(original) == digest(reordered)
    changed = deepcopy(original)
    changed[0]["snapshot"]["courses"][0]["pinned"] = False
    assert digest(original)["rows"] == digest(changed)["rows"]
    assert digest(original)["sha256"] != digest(changed)["sha256"]
    original_meeting = [{"data": {"starts_at": "2026-09-21T10:00:00Z"}}]
    changed_meeting = [{"data": {"starts_at": "2026-09-21T13:00:00Z"}}]
    assert digest(original_meeting)["sha256"] != digest(changed_meeting)["sha256"]
    assert digest([{"id": "a"}, {"id": "b"}]) == digest([{"id": "b"}, {"id": "a"}])
    assert canonical({"choices": ["a", "b"]}) != canonical({"choices": ["b", "a"]})
    print(
        "Canonical digest controls passed: key/row ordering, same-count plan and meeting mutations, ordered arrays"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-env", help="Environment variable holding the source database URL")
    parser.add_argument(
        "--restored-env", help="Environment variable holding the restored database URL"
    )
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.source_env:
        parser.error("--source-env is required unless --self-test is used")
    source = capture(os.environ[args.source_env])
    if not args.restored_env:
        print(json.dumps(source, indent=2, sort_keys=True))
        return 0
    restored = capture(os.environ[args.restored_env])
    differences = [
        name for name in source["tables"] if source["tables"][name] != restored["tables"][name]
    ]
    print(
        json.dumps(
            {
                "equal": not differences,
                "different_tables": differences,
                "source": source,
                "restored": restored,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return int(bool(differences))


if __name__ == "__main__":
    raise SystemExit(main())
