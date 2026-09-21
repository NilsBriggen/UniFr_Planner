"""Polite public HTTP adapter; parsing and publication decisions live elsewhere."""

import time
from collections.abc import Callable
from typing import Protocol
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .models import ListingEntry, ListingPage, Record
from .parsers import BASE, digest, parse_detail, parse_listing

CONNECTOR = (
    "https://www.unifr.ch/timetable/assets/components/timetable/connector.php?action=getlist"
)


class CachedResponse(Record):
    body: str
    etag: str = ""
    last_modified: str = ""
    fetched_at: float


class Response(Record):
    status: int
    body: str
    etag: str = ""
    last_modified: str = ""


class SourceCache(Protocol):
    def cache_get(self, key: str) -> CachedResponse | None: ...
    def cache_put(self, key: str, value: CachedResponse) -> None: ...


def public_url(url: str) -> None:
    parts = urlsplit(url)
    if (
        parts.scheme != "https"
        or parts.hostname != "www.unifr.ch"
        or not parts.path.startswith("/timetable/")
        or parts.username
        or parts.password
        or parts.port not in (None, 443)
    ):
        raise ValueError("Only public UniFr timetable URLs are permitted")


class NoRedirect(HTTPRedirectHandler):
    # Redirects are returned as HTTP errors; do not follow to private/session endpoints.
    def redirect_request(
        self, req: Request, fp: object, code: int, msg: str, headers: object, newurl: str
    ) -> None:
        return None


def transport(request: Request) -> Response:
    try:
        with build_opener(NoRedirect()).open(request, timeout=30) as response:
            return Response(
                status=response.status,
                body=response.read().decode("utf-8-sig"),
                etag=response.headers.get("ETag", ""),
                last_modified=response.headers.get("Last-Modified", ""),
            )
    except HTTPError as exc:
        if exc.code == 304:
            return Response(status=304, body="")
        raise


class HttpCatalogueSource:
    def __init__(
        self,
        cache: SourceCache,
        *,
        transport: Callable[[Request], Response] = transport,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.cache = cache
        self.transport = transport
        self.clock = clock
        self.sleep = sleep
        self.last_request: float | None = None

    def fetch(
        self,
        url: str,
        data: bytes | None = None,
        *,
        check: Callable[[str], object] | None = None,
        cache_scope: str = "",
        max_age: float = 0,
    ) -> str:
        public_url(url)
        key = digest(url + "|" + (data.decode() if data else "GET") + cache_scope)
        cached = self.cache.cache_get(key)
        if cached and max_age > 0 and 0 <= time.time() - cached.fetched_at < max_age:
            try:
                if check:
                    check(cached.body)
                return cached.body
            except ValueError:
                cached = None  # Invalid bytes cannot be refreshed by a conditional 304.
        headers = {"User-Agent": "UniFrPlanner/0.1 (public catalogue sync; max 2 req/s)"}
        if cached and data is None:
            if cached.etag:
                headers["If-None-Match"] = cached.etag
            if cached.last_modified:
                headers["If-Modified-Since"] = cached.last_modified
        for attempt in range(4):
            if self.last_request is not None:
                self.sleep(max(0, 0.5 - (self.clock() - self.last_request)))
            self.last_request = self.clock()
            try:
                response = self.transport(Request(url, data=data, headers=headers))
                if response.status == 304 and cached:
                    body = cached.body
                elif response.status == 200:
                    body = response.body
                else:
                    raise OSError(f"Unexpected HTTP status {response.status}")
                if check:
                    check(body)
                self.cache.cache_put(
                    key,
                    CachedResponse(
                        body=body,
                        etag=response.etag or (cached.etag if cached else ""),
                        last_modified=response.last_modified
                        or (cached.last_modified if cached else ""),
                        fetched_at=time.time(),
                    ),
                )
                return body
            except (OSError, ValueError) as error:
                if isinstance(error, ValueError):
                    cached = None
                    headers.pop("If-None-Match", None)
                    headers.pop("If-Modified-Since", None)
                if attempt == 3:
                    raise
                self.sleep(2**attempt)
        raise AssertionError("Unreachable retry state")

    def listing(self, number: int) -> ListingPage:
        values = dict.fromkeys(
            (
                "texte",
                "jour",
                "heure",
                "domaines",
                "semestres",
                "langues",
                "niveaux",
                "facultes",
                "public",
            ),
            "",
        )
        values.update(viewer="//www.unifr.ch/timetable/en/course.html", page=str(number))
        raw = self.fetch(
            CONNECTOR, urlencode(values).encode(), check=lambda html: parse_listing(html, number)
        )
        return parse_listing(raw, number)

    def detail(self, entry: ListingEntry) -> str:
        return self.fetch(
            BASE + "course.html?show=" + entry.source_id,
            check=lambda html: parse_detail(html, entry),
            cache_scope="|" + entry.fingerprint,
            max_age=3600,
        )
