"""Server-side sync entrypoint. Reports are persisted even when validation rejects a crawl."""

import argparse
from datetime import datetime, timezone
import logging
import time

from sqlalchemy import create_engine

from unifr_ingest.http import HttpCatalogueSource
from unifr_ingest.models import ListingEntry, ListingPage, Offering
from unifr_ingest.sync import next_sync, sync

from .catalogue import SqlCatalogueRepository
from .config import Settings

LOG = logging.getLogger(__name__)


class ProgressSource(HttpCatalogueSource):
    def listing(self, number: int, *, semester: str = "") -> ListingPage:
        page = super().listing(number, semester=semester)
        LOG.info("Listing %s/%s: %s reported", number, len(page.pages), page.reported_count)
        return page

    def detail(self, entry: ListingEntry, *, previous: Offering | None = None) -> str:
        raw = super().detail(entry, previous=previous)
        LOG.info("Detail %s %s", entry.source_id, entry.code)
        return raw


def main() -> int:
    parser = argparse.ArgumentParser(description="Catalogue sync: daily at 05:00 Europe/Zurich")
    parser.add_argument(
        "--once", action="store_true", help="Run immediately; exit 0 published, 1 rejected"
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    engine = create_engine(Settings().database_url)
    repository = SqlCatalogueRepository(engine)
    source = ProgressSource(repository)
    try:
        while True:
            if not args.once:
                due = next_sync(datetime.now(timezone.utc))
                LOG.info("Next catalogue sync: %s", due.isoformat())
                while (remaining := (due - datetime.now(timezone.utc)).total_seconds()) > 0:
                    time.sleep(min(remaining, 30))
            try:
                report = sync(source, repository)
                print(report.model_dump_json(), flush=True)
                if args.once:
                    return 0 if report.published else 1
            except (RuntimeError, OSError) as exc:
                LOG.error("Sync did not complete: %s", exc)
                if args.once:
                    return 2
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
