"""Read-only operations boundary. Operator token is separate from student sessions."""

import secrets
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import create_engine, select
from sqlalchemy.exc import SQLAlchemyError

from .catalogue import snapshots
from .config import Settings
from .operations import runs, state

router = APIRouter(prefix="/api/v1/admin")


def administrator(request: Request) -> None:
    token = Settings().admin_token
    headers = {"Cache-Control": "no-store"}
    if len(token) < 32:
        raise HTTPException(503, "Administration disabled", headers=headers)
    if not secrets.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
        raise HTTPException(401, "Administrator token required", headers=headers)


@router.get("/operations", dependencies=[Depends(administrator)])
def operations_status(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    engine = create_engine(Settings().database_url)
    try:
        with engine.connect() as connection:
            return {
                "schedule": {
                    "timezone": "Europe/Zurich",
                    "catalogue": "daily 05:00 (backup first)",
                    "documents": "Monday 04:30",
                },
                "jobs": [
                    dict(row)
                    for row in connection.execute(
                        select(runs).order_by(runs.c.started_at.desc()).limit(50)
                    ).mappings()
                ],
                "state": {
                    row[0]: row[1] for row in connection.execute(select(state.c.key, state.c.value))
                },
                "sync_history": [
                    dict(row)
                    for row in connection.execute(
                        select(snapshots.c.id, snapshots.c.status, snapshots.c.report)
                        .order_by(snapshots.c.report["completed_at"].as_string().desc())
                        .limit(50)
                    ).mappings()
                ],
                "alert_hook_configured": bool(Settings().alert_hook),
            }
    except SQLAlchemyError:
        raise HTTPException(
            503, "Operational database unavailable", headers={"Cache-Control": "no-store"}
        ) from None
    finally:
        engine.dispose()
