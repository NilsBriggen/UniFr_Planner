from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from unifr_ingest.models import Meeting


@pytest.mark.parametrize(
    "timestamps",
    [
        {},
        {"starts_at": datetime(2026, 9, 17, 10, tzinfo=timezone.utc)},
        {"ends_at": datetime(2026, 9, 17, 12, tzinfo=timezone.utc)},
    ],
)
def test_missing_timestamp_cannot_be_marked_resolved(timestamps):
    with pytest.raises(ValidationError, match="unresolved"):
        Meeting(**timestamps, unresolved=False)
    assert Meeting(**timestamps, unresolved=True).unresolved
