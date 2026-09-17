import os
import subprocess


def test_sync_cli_documents_daily_schedule_and_exit_codes():
    result = subprocess.run(
        [".venv/bin/python", "-m", "unifr_api.catalogue_sync", "--help"],
        env={**os.environ, "PYTHONPATH": "apps/api:packages/ingest/src"},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "05:00 Europe/Zurich" in result.stdout
    assert "--once" in result.stdout
