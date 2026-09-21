import importlib
import importlib.util

import pytest
from test_parsers import fixture


def module():
    assert importlib.util.find_spec("unifr_ingest.http"), "HTTP source adapter is not implemented"
    return importlib.import_module("unifr_ingest.http")


class Cache:
    def __init__(self):
        self.data = {}

    def cache_get(self, key):
        return self.data.get(key)

    def cache_put(self, key, value):
        self.data[key] = value


class Clock:
    def __init__(self):
        self.time = 0.0

    def now(self):
        return self.time

    def sleep(self, seconds):
        self.time += seconds


def test_http_rate_limit_retries_loading_and_exponential_backoff():
    m = module()
    clock = Clock()
    starts = []

    def transport(request):
        starts.append(clock.time)
        if len(starts) == 1:
            return m.Response(status=200, body="<p>Still loading...</p>")
        if len(starts) == 2:
            raise OSError("connection reset")
        return m.Response(status=200, body=fixture("listing.html"))

    source = m.HttpCatalogueSource(Cache(), transport=transport, clock=clock.now, sleep=clock.sleep)
    assert source.listing(1).reported_count == 3658
    source.listing(2)
    assert starts[:3] == [0, 1, 3]
    assert starts[3] - starts[2] >= 0.5


def test_conditional_detail_cache_and_304():
    m = module()
    requests = []

    def transport(request):
        requests.append(request)
        return (
            m.Response(status=200, body="html", etag="v1")
            if len(requests) == 1
            else m.Response(status=304, body="")
        )

    clock = Clock()
    source = m.HttpCatalogueSource(Cache(), transport=transport, clock=clock.now, sleep=clock.sleep)
    assert source.fetch("https://www.unifr.ch/timetable/en/course.html?show=1") == "html"
    assert source.fetch("https://www.unifr.ch/timetable/en/course.html?show=1") == "html"
    assert requests[1].get_header("If-none-match") == "v1"


@pytest.mark.parametrize(
    "kind, fetches", [("verified", 0), ("hash-mismatch", 1), ("expired", 1), ("changed-listing", 1)]
)
def test_parser_upgrade_can_reuse_only_recent_hash_verified_published_raw(kind, fetches):
    from datetime import datetime, timezone
    import time
    from unifr_ingest.parsers import parse_detail, parse_listing, digest

    m = module()
    cache, clock, calls = Cache(), Clock(), []
    entry = parse_listing(fixture("listing.html"), 1).entries[1]
    raw = fixture("detail.html")
    age = 25 * 3600 if kind == "expired" else 7200
    previous = parse_detail(raw, entry).model_copy(
        update={
            "parser_revision": 0,
            "detail_checked_at": datetime.now(timezone.utc),
            "detail_hash": "different" if kind == "hash-mismatch" else digest(raw),
        }
    )
    cache.cache_put(
        digest(entry.detail_url + "|GET|" + entry.fingerprint),
        m.CachedResponse(
            body=raw,
            fetched_at=time.time() - age,
        ),
    )
    if kind == "changed-listing":
        entry = entry.model_copy(update={"fingerprint": "changed"})

    def transport(request):
        calls.append(request)
        return m.Response(status=200, body=raw)

    source = m.HttpCatalogueSource(cache, transport=transport, clock=clock.now, sleep=clock.sleep)
    assert source.detail(entry, previous=previous) == raw
    assert len(calls) == fetches


def test_retries_are_bounded_and_private_urls_rejected():
    m = module()
    calls = []

    def transport(request):
        calls.append(request)
        raise OSError("offline")

    clock = Clock()
    source = m.HttpCatalogueSource(Cache(), transport=transport, clock=clock.now, sleep=clock.sleep)
    with pytest.raises(OSError):
        source.fetch("https://www.unifr.ch/timetable/en/course.html?show=1")
    assert len(calls) == 4
    with pytest.raises(ValueError):
        source.fetch("https://my.unifr.ch/private")


def test_detail_loading_is_retried_and_validated_checkpoint_survives_new_source():
    from unifr_ingest.parsers import parse_listing

    m = module()
    cache, clock, calls = Cache(), Clock(), []
    entry = parse_listing(fixture("listing.html"), 1).entries[1]

    def transport(request):
        calls.append(request)
        return m.Response(
            status=200, body=fixture("detail.html") if len(calls) > 1 else "<p>Still loading...</p>"
        )

    source = m.HttpCatalogueSource(cache, transport=transport, clock=clock.now, sleep=clock.sleep)
    assert source.detail(entry) == fixture("detail.html")
    resumed = m.HttpCatalogueSource(cache, transport=transport, clock=clock.now, sleep=clock.sleep)
    assert resumed.detail(entry) == fixture("detail.html")
    assert len(calls) == 2
    # A changed listing must not use an earlier detail checkpoint.
    resumed.detail(entry.model_copy(update={"fingerprint": "new"}))
    assert len(calls) == 3
    # Expired checkpoints cannot conceal detail-only updates.
    import time

    for key, value in cache.data.items():
        cache.data[key] = value.model_copy(update={"fetched_at": time.time() - 7200})
    resumed.detail(entry)
    assert len(calls) == 4


@pytest.mark.parametrize("age", [0, 7200])
def test_invalid_checkpoint_recovers_with_unconditional_request(age):
    import time
    from unifr_ingest.parsers import parse_listing, digest

    m = module()
    cache, clock, calls = Cache(), Clock(), []
    entry = parse_listing(fixture("listing.html"), 1).entries[1]
    key = digest(entry.detail_url + "|GET|" + entry.fingerprint)
    cache.cache_put(key, m.CachedResponse(body="broken", etag="old", fetched_at=time.time() - age))

    def transport(request):
        calls.append(request)
        if request.get_header("If-none-match"):
            return m.Response(status=304, body="")
        return m.Response(status=200, body=fixture("detail.html"))

    source = m.HttpCatalogueSource(cache, transport=transport, clock=clock.now, sleep=clock.sleep)
    assert source.detail(entry) == fixture("detail.html")
    assert not calls[-1].get_header("If-none-match")
    assert len(calls) <= 2
