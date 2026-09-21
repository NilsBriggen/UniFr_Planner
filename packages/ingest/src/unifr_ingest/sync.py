"""Pure crawl orchestration, validation and publication decisions."""

from collections import Counter
from datetime import datetime, time, timedelta, timezone
import json
from uuid import uuid4
from zoneinfo import ZoneInfo

from .models import CatalogueSnapshot, ListingPage, Offering, SyncReport
from .parsers import digest, parse_detail
from .ports import CatalogueRepository, CatalogueSource


def next_sync(now: datetime) -> datetime:
    local = now.astimezone(ZoneInfo("Europe/Zurich"))
    due = datetime.combine(local.date(), time(5), local.tzinfo)
    return due if local < due else due + timedelta(days=1)


def listing_hash(pages: list[ListingPage] | tuple[ListingPage, ...]) -> str:
    """Ignore incidental markup, but include every count, ID and listing field."""
    return digest(
        json.dumps(
            [page.model_dump(mode="json", exclude={"raw_hash"}) for page in pages], sort_keys=True
        )
    )


def validate(
    snapshot: CatalogueSnapshot, previous: CatalogueSnapshot | None
) -> tuple[list[str], list[str]]:
    errors = list(snapshot.errors)
    warnings = []
    pages = snapshot.pages
    if not pages:
        errors.append("No listing coverage")
    else:
        expected_pages = pages[0].model_copy(update={"reported_count": snapshot.reported_count})
        if [p.number for p in pages] != list(expected_pages.pages):
            errors.append("Incomplete pagination coverage")
        counts = {p.reported_count for p in pages}
        if max(counts) != snapshot.reported_count or any(
            p.page_size != pages[0].page_size for p in pages
        ):
            errors.append("Pagination changed during crawl")
        if len(counts) > 1:
            if snapshot.verified_listing_hash != listing_hash(pages):
                errors.append("Pagination changed: mixed cached counts without full index recheck")
            else:
                warnings.append(
                    f"Reconciled cached counts {sorted(counts)} against complete, "
                    "unique listing coverage and a stable full index recheck"
                )
        for page in pages:
            expected = min(
                page.page_size, max(0, snapshot.reported_count - (page.number - 1) * page.page_size)
            )
            if len(page.entries) != expected:
                errors.append(f"Page {page.number} expected {expected}, parsed {len(page.entries)}")
    entries = [entry for page in pages for entry in page.entries]
    ids = [entry.source_id for entry in entries]
    offered_ids = [offering.source_id for offering in snapshot.offerings]
    if len(ids) != snapshot.reported_count or len(offered_ids) != snapshot.reported_count:
        errors.append(
            f"Count mismatch: reported {snapshot.reported_count}, "
            f"listing {len(ids)}, details {len(offered_ids)}"
        )
    if len(set(ids)) != len(ids) or len(set(offered_ids)) != len(offered_ids):
        errors.append("duplicate source IDs")
    if set(ids) != set(offered_ids):
        errors.append("Listing/detail coverage mismatch")
    codes = Counter((off.course.code, term) for off in snapshot.offerings for term in off.terms)
    for (code, term), count in codes.items():
        if count > 1:
            errors.append(f"duplicate course code {code} in {term}: {count}")
    for off in snapshot.offerings:
        if not off.source_id or not off.course.code or not off.terms or not off.course.titles:
            errors.append(f"Missing required fields: {off.source_id}")
        if not off.meetings:
            errors.append(f"Missing meeting state: {off.source_id}")
        for meeting in off.meetings:
            if not meeting.unresolved and (meeting.starts_at is None or meeting.ends_at is None):
                errors.append(
                    f"Invalid meeting state {off.source_id}: missing time must be unresolved"
                )
        if off.ects is None:
            warnings.append(f"ECTS unpublished: {off.source_id}")
    if previous and previous.offerings:
        removed = {off.source_id for off in previous.offerings} - set(offered_ids)
        if len(removed) / len(previous.offerings) > 0.20:
            errors.append(f"Suspicious mass removal: {len(removed)}/{len(previous.offerings)}")
    return errors, warnings


def sync(
    source: CatalogueSource,
    repository: CatalogueRepository,
    *,
    now: datetime | None = None,
    detail_ttl: timedelta = timedelta(hours=24),
) -> SyncReport:
    checked_at = now or datetime.now(timezone.utc)
    with repository.lock():
        previous = repository.current()
        old = {off.source_id: off for off in previous.offerings} if previous else {}
        pages: list[ListingPage] = []
        offerings: list[Offering] = []
        failures: list[str] = []
        verified_listing_hash = None
        count = 0
        try:
            first = source.listing(1)
            pages.append(first)
            count = first.reported_count
            number = 2
            while (number - 1) * first.page_size < count:
                page = source.listing(number)
                pages.append(page)
                count = max(count, page.reported_count)
                if page.page_size != first.page_size:
                    raise ValueError("Pagination changed during crawl: page size")
                number += 1
            entries = [entry for page in pages for entry in page.entries]
            ids = [entry.source_id for entry in entries]
            if len(ids) != count or len(set(ids)) != len(ids):
                raise ValueError("Incomplete listing or duplicate source IDs")
            for entry in entries:
                cached = old.get(entry.source_id)
                if (
                    cached
                    and cached.listing_fingerprint == entry.fingerprint
                    and cached.detail_checked_at
                    and checked_at - cached.detail_checked_at < detail_ttl
                ):
                    offerings.append(cached)
                else:
                    offering = parse_detail(source.detail(entry), entry)
                    offerings.append(offering.model_copy(update={"detail_checked_at": checked_at}))
            final = [source.listing(page.number) for page in pages]
            if listing_hash(final) != listing_hash(pages):
                raise ValueError("Pagination changed during crawl (full index recheck)")
            verified_listing_hash = listing_hash(final)
        except (ValueError, OSError, KeyError) as exc:
            failures.append(f"{type(exc).__name__}: {exc}")
        snap = CatalogueSnapshot(
            snapshot_id=str(uuid4()),
            reported_count=count,
            pages=tuple(pages),
            offerings=tuple(offerings),
            errors=tuple(failures),
            verified_listing_hash=verified_listing_hash,
        )
        errors, warnings = validate(snap, previous)
        new = {off.source_id: off for off in offerings}
        report = SyncReport(
            snapshot_id=snap.snapshot_id,
            published=not errors,
            outcome=(
                "published"
                if not errors
                else "rejected_due_to_source_change"
                if any("Pagination changed" in error for error in errors)
                else "rejected_validation"
            ),
            reported_count=count,
            parsed_count=len(offerings),
            pages_fetched=len(pages),
            errors=tuple(errors),
            warnings=tuple(warnings),
            added=len(new.keys() - old.keys()),
            removed=len(old.keys() - new.keys()),
            changed=sum(
                new[key].model_dump(exclude={"detail_checked_at"})
                != old[key].model_dump(exclude={"detail_checked_at"})
                for key in new.keys() & old.keys()
            ),
            unresolved=sum(any(m.unresolved for m in off.meetings) for off in offerings),
            completed_at=datetime.now(timezone.utc),
            source_hashes={f"page:{p.number}": p.raw_hash for p in pages},
        )
        repository.stage(snap, report)
        if not errors:
            repository.publish(snap, report)
        return report
