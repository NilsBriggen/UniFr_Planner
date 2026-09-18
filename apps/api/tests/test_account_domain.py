import pytest
import json
from pathlib import Path

from unifr_api.account_models import validate_plan
from unifr_api.account_security import (
    AccountError,
    copied_plan,
    password_hash,
    revised_plan,
    verify_password,
)
from test_accounts import PASSWORD, plan

PARITY = json.loads((Path(__file__).parent / "fixtures/account-plan-parity.json").read_text())


@pytest.mark.parametrize("case", PARITY["cases"], ids=lambda case: case["name"])
def test_shared_server_browser_behavioral_parity(case):
    snapshot = {**PARITY["base"], **case["patch"]}
    if case["valid"]:
        assert validate_plan(snapshot) == snapshot
    else:
        with pytest.raises(ValueError):
            validate_plan(snapshot)


@pytest.mark.parametrize("number", [float("nan"), float("inf"), -float("inf")])
def test_domain_rejects_non_finite_json_numbers_before_persistence(number):
    with pytest.raises(ValueError):
        validate_plan({**plan(), "targetEcts": number})


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
