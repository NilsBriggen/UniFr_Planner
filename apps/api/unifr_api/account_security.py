"""Bounded authentication and revision rules, independent of HTTP and SQL."""

import hashlib
import secrets
from typing import Any
from dataclasses import dataclass

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError

from .account_models import SavedPlan, validate_plan

# RFC 9106's memory-constrained profile. Argon2id exclusively.
hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, type=Type.ID)
_dummy = hasher.hash(secrets.token_urlsafe(32))
SESSION_SECONDS = 30 * 24 * 60 * 60
WINDOW_SECONDS = 15 * 60


@dataclass
class AccountError(Exception):
    status: int
    detail: str


def digest(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def token() -> str:
    return secrets.token_urlsafe(32)


def password_hash(password: str) -> str:
    if not 12 <= len(password) <= 128:
        raise AccountError(422, "Invalid input")
    return hasher.hash(password)


def verify_password(encoded: str | None, password: str) -> bool:
    try:
        valid = hasher.verify(encoded or _dummy, password)
        return valid and encoded is not None and encoded.startswith("$argon2id$")
    except (VerificationError, InvalidHashError):
        return False


def copied_plan(snapshot: dict[str, Any], *, conflict_of: str | None = None) -> SavedPlan:
    identifier = secrets.token_hex(16)
    return SavedPlan(
        id=identifier,
        revision=1,
        snapshot=validate_plan({**snapshot, "id": identifier}),
        conflictOf=conflict_of,
    )


def revised_plan(
    current: SavedPlan, revision: int, snapshot: dict[str, Any]
) -> tuple[SavedPlan, SavedPlan | None]:
    snapshot = validate_plan(snapshot)
    if snapshot["id"] != current.id:
        raise AccountError(422, "Plan identifier mismatch")
    if current.revision != revision:
        return current, copied_plan(snapshot, conflict_of=current.id)
    return current.model_copy(update={"revision": current.revision + 1, "snapshot": snapshot}), None
