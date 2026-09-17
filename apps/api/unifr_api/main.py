from fastapi import FastAPI, HTTPException
from sqlalchemy.exc import SQLAlchemyError

from unifr_api.database import check_database

app = FastAPI(title="UniFr Planner API", version="0.1.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness only; database readiness is reported independently."""
    return {"status": "ok", "service": "unifr-planner"}


@app.get("/api/ready")
def ready() -> dict[str, str]:
    try:
        check_database()
    except SQLAlchemyError as error:
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    return {"status": "ready"}
