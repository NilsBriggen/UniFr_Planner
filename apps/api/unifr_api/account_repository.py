"""SQL persistence, serialized account mutations and atomic optimistic writes."""

import hmac
import json
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    JSON,
    String,
    Table,
    delete,
    insert,
    select,
    update,
    func,
)
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError

from .database import metadata
from .account_models import (
    AccountArchive,
    Identity,
    PlanList,
    RecoverySnapshot,
    SavedPlan,
    WriteResult,
)
from .account_security import (
    AccountError,
    SESSION_SECONDS,
    WINDOW_SECONDS,
    copied_plan,
    digest,
    password_hash,
    revised_plan,
    token,
    verify_password,
)

users = Table(
    "account_user",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("username", String(32), unique=True, nullable=False),
    Column("password_hash", String(256), nullable=False),
    Column("recovery_hash", String(64), nullable=False),
)
sessions = Table(
    "account_session",
    metadata,
    Column("token_hash", String(64), primary_key=True),
    Column(
        "user_id",
        String(64),
        ForeignKey("account_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    ),
    Column("expires_at", Integer, nullable=False),
)
plans = Table(
    "account_plan",
    metadata,
    Column("id", String(64), primary_key=True),
    Column(
        "user_id",
        String(64),
        ForeignKey("account_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    ),
    Column("revision", Integer, nullable=False),
    Column("snapshot", JSON, nullable=False),
    Column("conflict_of", String(64)),
)
limits = Table(
    "account_rate_limit",
    metadata,
    Column("key", String(64), primary_key=True),
    Column("window", Integer, nullable=False),
    Column("attempts", Integer, nullable=False),
)


def saved(row: Any) -> SavedPlan:
    return SavedPlan(
        id=row.id, revision=row.revision, snapshot=row.snapshot, conflictOf=row.conflict_of
    )


class AccountRepository:
    def __init__(self, engine: Engine, *, expected_owner: str | None = None):
        self.engine = engine
        self.expected_owner = expected_owner

    def rate_limit(self, address: str, username: str) -> None:
        """Persistent atomic counters shared across workers; failed auth commits its budget."""
        window = int(time.time()) // WINDOW_SECONDS
        blocked = False
        with self.engine.begin() as conn:
            conn.execute(delete(limits).where(limits.c.window < window))
            # Hard global ceiling also bounds random-username/IP database growth and Argon2 load.
            for key, maximum in (("global", 300), ("ip:" + address, 30), ("user:" + username, 10)):
                stmt = (pg_insert if conn.dialect.name == "postgresql" else sqlite_insert)(limits)
                stmt = stmt.values(key=digest(key), window=window, attempts=1)
                stmt = stmt.on_conflict_do_update(
                    index_elements=[limits.c.key], set_={"attempts": limits.c.attempts + 1}
                )
                count = conn.execute(stmt.returning(limits.c.attempts)).scalar_one()
                if count > maximum:
                    blocked = True
                    break
        if blocked:
            raise AccountError(429, "Try again later")

    def register(self, username: str, password: str) -> tuple[str, str]:
        secret, recovery = token(), token()
        encoded = password_hash(password)
        try:
            with self.engine.begin() as conn:
                user_id = token()
                conn.execute(
                    insert(users).values(
                        id=user_id,
                        username=username,
                        password_hash=encoded,
                        recovery_hash=digest(recovery),
                    )
                )
                self._session(conn, user_id, secret)
        except IntegrityError as error:
            raise AccountError(400, "Account could not be created") from error
        return secret, recovery

    def _session(self, conn: Connection, user_id: str, secret: str) -> None:
        conn.execute(delete(sessions).where(sessions.c.expires_at <= int(time.time())))
        # Bound active sessions (and idle database growth) per account.
        count = conn.execute(
            select(func.count()).select_from(sessions).where(sessions.c.user_id == user_id)
        ).scalar_one()
        if count >= 20:
            oldest = conn.execute(
                select(sessions.c.token_hash)
                .where(sessions.c.user_id == user_id)
                .order_by(sessions.c.expires_at)
                .limit(1)
            ).scalar_one()
            conn.execute(delete(sessions).where(sessions.c.token_hash == oldest))
        conn.execute(
            insert(sessions).values(
                token_hash=digest(secret),
                user_id=user_id,
                expires_at=int(time.time()) + SESSION_SECONDS,
            )
        )

    def login(self, username: str, password: str, old_token: str | None) -> str:
        secret = token()
        with self.engine.begin() as conn:
            row = conn.execute(
                select(users).where(users.c.username == username).with_for_update()
            ).first()
            if not verify_password(row.password_hash if row else None, password):
                raise AccountError(401, "Authentication failed")
            assert row is not None
            if old_token:
                conn.execute(delete(sessions).where(sessions.c.token_hash == digest(old_token)))
            self._session(conn, row.id, secret)
        return secret

    def recover(self, username: str, recovery: str, password: str) -> tuple[str, str]:
        secret, replacement = token(), token()
        # Same Argon2 work for unknown/incorrect recovery as valid recovery.
        encoded = password_hash(password)
        with self.engine.begin() as conn:
            row = conn.execute(
                select(users).where(users.c.username == username).with_for_update()
            ).first()
            if (
                not hmac.compare_digest(row.recovery_hash if row else "0" * 64, digest(recovery))
                or row is None
            ):
                raise AccountError(401, "Authentication failed")
            conn.execute(
                update(users)
                .where(users.c.id == row.id)
                .values(password_hash=encoded, recovery_hash=digest(replacement))
            )
            conn.execute(delete(sessions).where(sessions.c.user_id == row.id))
            self._session(conn, row.id, secret)
        return secret, replacement

    def _owner(self, conn: Connection, secret: str | None) -> Any:
        if not secret or len(secret) > 128:
            raise AccountError(401, "Authentication required")
        # Lock the owner before mutations. Recovery/deletion and writes serialize.
        user_id = conn.execute(
            select(sessions.c.user_id).where(
                sessions.c.token_hash == digest(secret), sessions.c.expires_at > int(time.time())
            )
        ).scalar_one_or_none()
        row = conn.execute(select(users).where(users.c.id == user_id).with_for_update()).first()
        # Recheck after waiting for recovery/deletion locks (READ COMMITTED).
        valid = conn.execute(
            select(sessions.c.user_id).where(
                sessions.c.token_hash == digest(secret), sessions.c.expires_at > int(time.time())
            )
        ).scalar_one_or_none()
        if row is None or valid != row.id:
            raise AccountError(401, "Authentication required")
        if self.expected_owner is not None and self.expected_owner != row.id:
            raise AccountError(409, "Account changed; refresh identity")
        return row

    def identity(self, secret: str | None) -> str:
        return self.account_identity(secret).username

    def account_identity(self, secret: str | None) -> Identity:
        with self.engine.begin() as conn:
            owner = self._owner(conn, secret)
            return Identity(username=owner.username, accountId=owner.id)

    def logout(self, secret: str | None) -> None:
        with self.engine.begin() as conn:
            if self.expected_owner is not None:
                self._owner(conn, secret)
            if secret:
                conn.execute(delete(sessions).where(sessions.c.token_hash == digest(secret)))

    def _plans(self, conn: Connection, owner: str) -> PlanList:
        result = PlanList(plans=[])
        for row in conn.execute(select(plans).where(plans.c.user_id == owner).order_by(plans.c.id)):
            try:
                result.plans.append(saved(row))
            except ValueError:
                # Retain historical malformed data, with explicit recovery access.
                result.unreadableIds.append(row.id)
        return result

    def list_plans(self, secret: str | None) -> list[SavedPlan]:
        return self.plan_listing(secret).plans

    def plan_listing(self, secret: str | None) -> PlanList:
        with self.engine.begin() as conn:
            return self._plans(conn, self._owner(conn, secret).id)

    def recover_snapshot(self, secret: str | None, identifier: str) -> RecoverySnapshot:
        with self.engine.begin() as conn:
            owner = self._owner(conn, secret).id
            row = conn.execute(
                select(plans).where(plans.c.id == identifier, plans.c.user_id == owner)
            ).first()
            if row is None:
                raise AccountError(404, "Plan not found")
            return RecoverySnapshot(
                id=row.id,
                revision=row.revision,
                snapshotJson=json.dumps(row.snapshot, ensure_ascii=True, indent=2),
            )

    def _capacity(self, conn: Connection, owner: str, additions: list[SavedPlan]) -> None:
        # Malformed records still occupy storage, but must not poison valid writes.
        existing = list(
            conn.execute(select(plans.c.snapshot).where(plans.c.user_id == owner)).scalars()
        )
        if (
            len(existing) + len(additions) > 100
            or len(
                json.dumps(existing + [p.snapshot for p in additions], ensure_ascii=False).encode(
                    errors="surrogatepass"
                )
            )
            > 20_000_000
        ):
            raise AccountError(413, "Account storage limit reached; export your plans")

    def _insert_plan(self, conn: Connection, owner: str, plan: SavedPlan) -> None:
        conn.execute(
            insert(plans).values(
                id=plan.id,
                user_id=owner,
                revision=plan.revision,
                snapshot=plan.snapshot,
                conflict_of=plan.conflictOf,
            )
        )

    def import_plans(self, secret: str | None, snapshots: list[dict[str, Any]]) -> list[SavedPlan]:
        copies = [copied_plan(snapshot) for snapshot in snapshots]
        with self.engine.begin() as conn:
            owner = self._owner(conn, secret).id
            self._capacity(conn, owner, copies)
            for plan in copies:
                self._insert_plan(conn, owner, plan)
        return copies

    def write_plan(
        self, secret: str | None, identifier: str, revision: int, snapshot: dict[str, Any]
    ) -> WriteResult:
        with self.engine.begin() as conn:
            owner = self._owner(conn, secret).id
            row = conn.execute(
                select(plans).where(plans.c.id == identifier, plans.c.user_id == owner)
            ).first()
            if row is None:
                raise AccountError(404, "Plan not found")
            try:
                previous = saved(row)
            except ValueError as error:
                raise AccountError(409, "Plan unreadable; download recovery data") from error
            current, conflict = revised_plan(previous, revision, snapshot)
            if conflict:
                self._capacity(conn, owner, [conflict])
                self._insert_plan(conn, owner, conflict)
            else:
                conn.execute(
                    update(plans)
                    .where(
                        plans.c.id == identifier,
                        plans.c.user_id == owner,
                        plans.c.revision == revision,
                    )
                    .values(snapshot=current.snapshot, revision=current.revision)
                )
                self._capacity(conn, owner, [])
        return WriteResult(plan=current, conflict=conflict)

    def export(self, secret: str | None) -> AccountArchive:
        with self.engine.begin() as conn:
            owner = self._owner(conn, secret)
            return AccountArchive(
                username=owner.username,
                accountId=owner.id,
                **self._plans(conn, owner.id).model_dump(),
                exportedAt=datetime.now(timezone.utc).isoformat(),
            )

    def delete_account(self, secret: str | None, password: str) -> None:
        with self.engine.begin() as conn:
            owner = self._owner(conn, secret)
            if not verify_password(owner.password_hash, password):
                raise AccountError(401, "Authentication failed")
            conn.execute(delete(plans).where(plans.c.user_id == owner.id))
            conn.execute(delete(sessions).where(sessions.c.user_id == owner.id))
            conn.execute(delete(users).where(users.c.id == owner.id))
