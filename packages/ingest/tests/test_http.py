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
