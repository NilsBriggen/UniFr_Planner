"""Validated account contracts and complete guest-plan snapshot invariants."""

import json
import copy
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Literal, Self
from collections.abc import Iterator

from jsonschema import Draft202012Validator, FormatChecker, ValidationError, validators
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator

_schema = json.loads(Path(__file__).with_name("guest-plan.schema.json").read_text())


def _js_pattern(
    validator: Any, pattern: str, instance: Any, schema: Any
) -> Iterator[ValidationError]:
    # All generated guest patterns are whole-string constraints. Python `$`
    # otherwise accepts a final newline that the browser rejects.
    if isinstance(instance, str) and not re.fullmatch(pattern, instance, flags=re.ASCII):
        yield ValidationError("Invalid string pattern")


def _js_max_length(
    validator: Any, maximum: int, instance: Any, schema: Any
) -> Iterator[ValidationError]:
    if isinstance(instance, str) and len(instance.encode("utf-16-le")) // 2 > maximum:
        yield ValidationError("String too long")


# The upstream stub does not type the validator extension factory.
_guest_validator = validators.extend(  # type: ignore[no-untyped-call]
    Draft202012Validator, {"pattern": _js_pattern, "maxLength": _js_max_length}
)
_validator = _guest_validator(_schema, format_checker=FormatChecker())
_JS_SPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def validate_plan(value: dict[str, Any]) -> dict[str, Any]:
    if len(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).encode()) > 5_000_000:
        raise ValueError("Invalid plan")
    if not _validator.is_valid(value):
        raise ValueError("Invalid plan")
    value = copy.deepcopy(value)

    # Zod trims selected text fields; JSON Schema cannot encode transforms.
    def trim(record: dict[str, Any], *keys: str) -> None:
        for key in keys:
            record[key] = record[key].strip(_JS_SPACE)
            if not record[key]:
                raise ValueError("Empty text")

    def identifier(text: str) -> None:
        # JavaScript's \\w is ASCII, unlike Python's Unicode default.
        if re.fullmatch(r"[A-Za-z0-9_-]{1,100}", text) is None:
            raise ValueError("Invalid identifier")

    identifier(value["id"])
    identifier(value["activeScenarioId"])
    trim(value, "name", "programme")

    def unique(items: list[str]) -> None:
        if len(set(items)) != len(items):
            raise ValueError("Duplicate identifier")

    unique(value["semesters"])
    if value.get("planningSemester") is not None and value["planningSemester"] not in value["semesters"]:
        raise ValueError("Unknown planning semester")
    unique([s["id"] for s in value["scenarios"]])
    if value["activeScenarioId"] not in [s["id"] for s in value["scenarios"]]:
        raise ValueError("Missing active scenario")
    if "degreeSelection" in value:
        if value["schemaVersion"] != 2 or "requirements" in value:
            raise ValueError("Recipe selection requires v2 without legacy requirements")
        selection = value["degreeSelection"]
        trim(selection, "structureId")
        for component in selection["components"]:
            trim(component, "slotId", "programmeId", "variantId", "recipeVersion")
        unique([c["slotId"] for c in selection["components"]])
    if "requirements" in value:
        for template in value["requirements"]["templates"]:
            trim(template, "code", "version")
        unique([t["code"] for t in value["requirements"]["templates"]])
    for scenario in value["scenarios"]:
        identifier(scenario["id"])
        trim(scenario, "name")
        for course in scenario["courses"]:
            identifier(course["id"])
            trim(course, "code")
            if course["offering"]:
                trim(course["offering"], "source_id")
        unique([c["id"] for c in scenario["courses"]])
        # Match the browser's exact timetable teaching-unit namespace rule.
        unique(
            [
                re.sub(r"^UE-(?=[A-Z][A-Z0-9]*\.[0-9]+\Z)", "", c["code"])
                for c in scenario["courses"]
            ]
        )
        unique([p["id"] for p in scenario["unavailable"]])
        for period in scenario["unavailable"]:
            identifier(period["id"])
            trim(period, "label")
            epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
            start_ms = (datetime.fromisoformat(period["start"]) - epoch) // timedelta(
                milliseconds=1
            )
            end_ms = (datetime.fromisoformat(period["end"]) - epoch) // timedelta(milliseconds=1)
            if end_ms <= start_ms:
                raise ValueError("Invalid busy period")
        if "requirementEvidence" in scenario:
            evidence = scenario["requirementEvidence"]
            for override in evidence["overrides"]:
                identifier(override["courseId"])
                trim(override, "reason")
            unique([o["courseId"] for o in evidence["overrides"]])
            unique(evidence["completedChecklist"])
        for course in scenario["courses"]:
            if not course["titles"]:
                raise ValueError("Missing title")
            if course["semester"] is not None and course["semester"] not in value["semesters"]:
                raise ValueError("Unknown semester")
            if course["status"] == "unscheduled" and course["semester"] is not None:
                raise ValueError("Unscheduled course allocated")
            if course["status"] in ("current", "planned") and course["semester"] is None:
                raise ValueError("Missing semester")
    return value


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class PrivateError(Contract):
    detail: str


class Password(Contract):
    password: SecretStr = Field(min_length=12, max_length=128)


class Credentials(Password):
    username: str = Field(pattern=r"^[a-zA-Z0-9_-]{3,32}$")

    @field_validator("username")
    @classmethod
    def canonical(cls, value: str) -> str:
        return value.lower()


class Recovery(Credentials):
    recoveryCode: SecretStr = Field(min_length=32, max_length=128)


class Identity(Contract):
    username: str
    accountId: str


class Created(Identity):
    recoveryCode: str


class SavedPlan(Contract):
    id: str
    revision: int = Field(ge=1)
    snapshot: dict[str, Any]
    conflictOf: str | None = None

    @field_validator("snapshot")
    @classmethod
    def valid(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_plan(value)


class PlanWrite(Contract):
    revision: int = Field(ge=1, le=2**31 - 1, strict=True)
    snapshot: dict[str, Any]

    @field_validator("snapshot")
    @classmethod
    def valid(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_plan(value)


class PlanList(Contract):
    plans: list[SavedPlan]
    unreadableIds: list[str] = Field(default_factory=list)


class RecoverySnapshot(Contract):
    schemaVersion: Literal[1] = 1
    kind: Literal["unvalidated-plan-recovery"] = "unvalidated-plan-recovery"
    id: str
    revision: int
    snapshotJson: str


class GuestImport(Contract):
    plans: Annotated[list[dict[str, Any]], Field(min_length=1, max_length=100)]

    @field_validator("plans")
    @classmethod
    def valid(cls, values: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [validate_plan(value) for value in values]


class WriteResult(Contract):
    plan: SavedPlan
    conflict: SavedPlan | None = None


class AccountArchive(Identity, PlanList):
    schemaVersion: Literal[1] = 1
    exportedAt: str

    @model_validator(mode="after")
    def unique(self) -> Self:
        if len({p.id for p in self.plans}) != len(self.plans):
            raise ValueError("Duplicate plan")
        return self
