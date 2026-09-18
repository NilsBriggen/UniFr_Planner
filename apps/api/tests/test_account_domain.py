import pytest

from unifr_api.account_models import validate_plan
from unifr_api.account_security import (
    AccountError,
    copied_plan,
    password_hash,
    revised_plan,
    verify_password,
)
from test_accounts import PASSWORD, plan


def test_argon2id_salts_and_unknown_hash_negative_control():
    first, second = password_hash(PASSWORD), password_hash(PASSWORD)
    assert first != second
    assert first.startswith("$argon2id$v=19$m=65536,t=3,p=4$")
    assert verify_password(first, PASSWORD)
    assert not verify_password(first, PASSWORD + "wrong")
    assert not verify_password(None, PASSWORD)
    assert not verify_password("malformed", PASSWORD)


def test_revision_rules_validate_complete_snapshot_even_without_http():
    current = copied_plan(plan())
    invalid = dict(current.snapshot, activeScenarioId="absent")
    with pytest.raises(ValueError):
        revised_plan(current, 1, invalid)
    with pytest.raises(AccountError):
        revised_plan(current, 1, {**current.snapshot, "id": "another"})


def test_guest_normalization_does_not_mutate_source():
    original = plan()
    original["name"] = "  My degree  "
    normalized = validate_plan(original)
    assert normalized["name"] == "My degree"
    assert original["name"] == "  My degree  "
