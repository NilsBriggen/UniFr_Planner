"""Capability-owned public plan snapshots; reading links never authorize writes."""

from collections.abc import Iterator
from datetime import datetime, timezone
import hmac
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Request
from pydantic import Field, SecretStr, field_validator
from sqlalchemy import Column, ForeignKey, Integer, JSON, String, Table, create_engine
from sqlalchemy import delete, insert, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError

from .account_models import Contract, PrivateError, validate_plan
from .account_repository import sessions
from .account_routes import secret
from .account_security import AccountError, digest, token
from .config import Settings
from .database import metadata

shares = Table(
    "sharing_plan",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("owner_hash", String(64), unique=True, nullable=False),
    Column("user_id", String(64), ForeignKey("account_user.id", ondelete="CASCADE")),
    Column("revision", Integer, nullable=False),
    Column("snapshot", JSON, nullable=True),
    Column("updated_at", String(40), nullable=False),
)
limits = Table(
    "sharing_rate_limit",
    metadata,
    Column("key", String(64), primary_key=True),
    Column("window", Integer, nullable=False),
    Column("attempts", Integer, nullable=False),
)


class ShareWrite(Contract):
    snapshot: dict[str, Any]
    revision: int = Field(ge=1, le=2**31 - 1, strict=True)

    @field_validator("snapshot")
    @classmethod
    def valid(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_plan(value)


class ShareCreate(Contract):
    ownerKey: SecretStr = Field(min_length=43, max_length=43)
    snapshot: dict[str, Any]

    @field_validator("snapshot")
    @classmethod
    def valid(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_plan(value)


class SharedPlan(Contract):
    id: str
    revision: int
    updatedAt: str
    snapshot: dict[str, Any]
    canManage: bool


class ShareRepository:
    def __init__(self, engine: Engine):
        self.engine = engine

    def limit(self, address: str, action: str) -> None:
        window = int(time.time()) // 60
        with self.engine.begin() as conn:
            conn.execute(delete(limits).where(limits.c.window < window))
            statement = (pg_insert if conn.dialect.name == "postgresql" else sqlite_insert)(limits)
            statement = statement.values(key=digest(action + address), window=window, attempts=1)
            count = conn.execute(
                statement.on_conflict_do_update(
                    index_elements=[limits.c.key], set_={"attempts": limits.c.attempts + 1}
                ).returning(limits.c.attempts)
            ).scalar_one()
        if count > (10 if action == "create" else 120):
            raise AccountError(429, "Try again later")

    def account(self, cookie: str | None) -> str | None:
        if not cookie or len(cookie) > 128:
            return None
        with self.engine.connect() as conn:
            return conn.execute(
                select(sessions.c.user_id).where(
                    sessions.c.token_hash == digest(cookie),
                    sessions.c.expires_at > int(time.time()),
                )
            ).scalar_one_or_none()

    @staticmethod
    def owns(row: Any, key: str | None, user: str | None) -> bool:
        return bool(
            (key and len(key) == 43 and hmac.compare_digest(row.owner_hash, digest(key)))
            or (user is not None and user == row.user_id)
        )

    def read(self, identifier: str, key: str | None, user: str | None) -> SharedPlan:
        with self.engine.connect() as conn:
            row = conn.execute(select(shares).where(shares.c.id == identifier)).first()
        if row is None or row.snapshot is None:
            raise AccountError(404, "Shared plan unavailable")
        return SharedPlan(
            id=row.id,
            revision=row.revision,
            updatedAt=row.updated_at,
            snapshot=validate_plan(row.snapshot),
            canManage=self.owns(row, key, user),
        )

    def create(self, body: ShareCreate, user: str | None) -> SharedPlan:
        owner_hash = digest(body.ownerKey.get_secret_value())
        with self.engine.begin() as conn:
            existing = conn.execute(
                select(shares.c.id).where(shares.c.owner_hash == owner_hash)
            ).scalar_one_or_none()
            if existing is None:
                identifier = token()
                try:
                    conn.execute(
                        insert(shares).values(
                            id=identifier,
                            owner_hash=owner_hash,
                            user_id=user,
                            revision=1,
                            snapshot=body.snapshot,
                            updated_at=datetime.now(timezone.utc).isoformat(),
                        )
                    )
                except IntegrityError as error:
                    raise AccountError(409, "Retry creating this share") from error
            else:
                identifier = existing
        return self.read(identifier, body.ownerKey.get_secret_value(), user)

    def write(
        self, identifier: str, body: ShareWrite | None, key: str | None, user: str | None
    ) -> SharedPlan | None:
        with self.engine.begin() as conn:
            row = conn.execute(
                select(shares).where(shares.c.id == identifier).with_for_update()
            ).first()
            if row is None or row.snapshot is None:
                raise AccountError(404, "Shared plan unavailable")
            if not self.owns(row, key, user):
                raise AccountError(403, "Only the owner can change this plan")
            if body is not None and body.revision != row.revision:
                raise AccountError(409, "Shared plan changed; reopen it before editing")
            result = conn.execute(
                update(shares)
                .where(shares.c.id == identifier, shares.c.revision == row.revision)
                .values(
                    snapshot=body.snapshot if body else None,
                    revision=row.revision + 1,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
            )
            if result.rowcount != 1:
                raise AccountError(409, "Shared plan changed; reopen it before editing")
        return self.read(identifier, key, user) if body else None


def repository() -> Iterator[ShareRepository]:
    engine = create_engine(Settings().database_url)
    try:
        yield ShareRepository(engine)
    finally:
        engine.dispose()


Repo = Annotated[ShareRepository, Depends(repository)]
OwnerKey = Annotated[str | None, Header(alias="X-Unifr-Share-Key", max_length=128)]
router = APIRouter(
    prefix="/api/v1/shares",
    tags=["sharing"],
    responses={code: {"model": PrivateError} for code in (403, 404, 409, 413, 422, 429)},
)


@router.post("", response_model=SharedPlan, status_code=201)
def create_share(body: ShareCreate, request: Request, repo: Repo) -> SharedPlan:
    repo.limit(request.client.host if request.client else "unknown", "create")
    return repo.create(body, repo.account(secret(request)))


@router.get("/{identifier}", response_model=SharedPlan)
def read_share(
    identifier: str, request: Request, repo: Repo, owner_key: OwnerKey = None
) -> SharedPlan:
    return repo.read(identifier, owner_key, repo.account(secret(request)))


@router.put("/{identifier}", response_model=SharedPlan)
def update_share(
    identifier: str, body: ShareWrite, request: Request, repo: Repo, owner_key: OwnerKey = None
) -> SharedPlan:
    repo.limit(request.client.host if request.client else "unknown", "write")
    result = repo.write(identifier, body, owner_key, repo.account(secret(request)))
    assert result is not None
    return result


@router.delete("/{identifier}", status_code=204)
def revoke_share(identifier: str, request: Request, repo: Repo, owner_key: OwnerKey = None) -> None:
    repo.limit(request.client.host if request.client else "unknown", "write")
    repo.write(identifier, None, owner_key, repo.account(secret(request)))
