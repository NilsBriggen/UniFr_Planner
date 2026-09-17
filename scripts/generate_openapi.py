"""Generate the committed public contract from FastAPI; run from repository root."""

import json
from pathlib import Path

from unifr_api.main import app

Path("apps/web/src/api/openapi.json").write_text(
    json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n"
)
