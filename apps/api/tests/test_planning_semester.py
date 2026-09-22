"""Optional planning term preserves v1/v2 account and sharing plan compatibility."""

import copy
import json
from pathlib import Path

import pytest

from unifr_api.account_models import validate_plan

BASE = json.loads((Path(__file__).parent / "fixtures/account-plan-parity.json").read_text())["base"]


@pytest.mark.parametrize("version", [1, 2])
def test_optional_planning_term_and_completed_manual_round_trip(version):
    plan = copy.deepcopy(BASE)
    plan["schemaVersion"] = version
    plan["semesters"] = ["AS-2024", "SS-2025", "AS-2025", "SS-2026", "AS-2026"]
    for scenario in plan["scenarios"]:
        scenario["courses"] = []
    assert "planningSemester" not in validate_plan(plan)
    plan["planningSemester"] = "AS-2026"
    plan["scenarios"][0]["courses"] = [
        {
            "id": "manual",
            "code": "MANUAL-12345678-1234-1234-1234-123456789012",
            "titles": {"en": "Previously completed"},
            "ects": 5,
            "status": "completed",
            "semester": None,
            "pinned": False,
            "offering": None,
        }
    ]
    validated = validate_plan(json.loads(json.dumps(plan)))
    assert validated == plan
    assert validated["semesters"][0] == "AS-2024"
    plan["planningSemester"] = "AS-2030"
    with pytest.raises(ValueError, match="Unknown planning semester"):
        validate_plan(plan)
