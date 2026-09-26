"""Official German and French programme names; display metadata, never academic evidence.

Maintainer tool, never run from CI. It politely fetches each programme's canonical German and
French page, validates it and writes a review manifest. ``--apply`` then copies the reviewed
names into recipes.yaml without fetching anything.
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
from pathlib import Path
import random
import re
import subprocess
import sys
import time
from typing import Any
from urllib.error import HTTPError
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import Request, build_opener
from urllib.robotparser import RobotFileParser
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup, Tag

from .operations import NoRedirect
from .programme_review import content_hash

HOST = "studies.unifr.ch"
LANGUAGES = ("de", "fr")
USER_AGENT = "UniFr-Planner-programme-names/1 (+https://github.com/NilsBriggen/UniFr_Planner)"
MAX_BYTES = 20_000_000
DIRECTORY = re.compile(
    r"https://studies\.unifr\.ch/en/(?P<path>(?P<degree>bachelor|master)/[a-z0-9]+/[a-z0-9-]+)"
)
TITLE = re.compile(r"^(?P<name>.+?)\s+\((?P<degree>bachelor|master)\)\s*\|\s*Studies\s*\|")
DEGREE_SUFFIX = re.compile(r"\((?:bachelor|master)\)", re.IGNORECASE)
# A systemic fallback (for example English content on every page) must stop the run early.
ANCHORS = {
    ("bachelor-sci-mathematics", "de"): "Mathematik",
    ("bachelor-sci-mathematics", "fr"): "Mathématiques",
    ("bachelor-digitinf-informatics", "de"): "Informatik",
    ("bachelor-digitinf-informatics", "fr"): "Informatique",
    ("bachelor-eco-management", "de"): "Betriebswirtschaftslehre",
}
NOT_CLAIMED = [
    "Names are display metadata; they are not curriculum, eligibility or completion evidence.",
    "No programme, variant or source review status changes.",
    "Pages are not archived; the digests allow re-verification at the next review.",
]


class Unavailable(Exception):
    """A page that could not be fetched as HTML; its body is never used."""


class Invalid(Exception):
    """A fetched page whose name cannot be trusted for this programme and language."""


class CalibrationError(Exception):
    """Anchor names failed, so the site is not serving localized pages as expected."""


@dataclass(frozen=True)
class Programme:
    id: str
    degree: str
    title: str
    path: str

    def url(self, language: str) -> str:
        return f"https://{HOST}/{language}/{self.path}"


@dataclass(frozen=True)
class Response:
    status: int
    body: bytes = b""
    content_type: str = ""
    location: str | None = None


Transport = Callable[[str], Response]


def load_programmes(registry: dict[str, Any]) -> list[Programme]:
    """Each programme's canonical page follows its English directory source URL."""
    sources = {s["id"]: s["url"] for s in registry["sources"]}
    programmes = []
    for p in registry["programmes"]:
        matches = [m for i in p["sourceIds"] if (m := DIRECTORY.fullmatch(sources[i]))]
        if (
            len(matches) != 1
            or matches[0]["path"].replace("/", "-") != p["id"]
            or matches[0]["degree"] != p["degree"]
        ):
            raise ValueError(f"No unique directory source: {p['id']}")
        programmes.append(Programme(p["id"], p["degree"], p["title"], matches[0]["path"]))
    return programmes


def urllib_transport(url: str) -> Response:
    if urlsplit(url).scheme != "https":
        raise ValueError("Sources require HTTPS")
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=30) as response:
            body = response.read(MAX_BYTES + 1)
            return Response(response.status, bytes(body), response.headers.get_content_type())
    except HTTPError as error:
        location = error.headers.get("Location") if error.headers else None
        error.close()
        return Response(error.code, location=location)


class PoliteFetcher:
    """Sequential, delayed, robots.txt-aware; at most one same-host same-language redirect."""

    def __init__(
        self,
        transport: Transport = urllib_transport,
        *,
        delay: float = 2.0,
        jitter: float = 1.0,
        retry_after: float = 10.0,
        sleep: Callable[[float], None] = time.sleep,
        rng: Callable[[], float] = random.random,
    ) -> None:
        self.transport, self.delay, self.jitter = transport, delay, jitter
        self.retry_after, self.sleep, self.rng = retry_after, sleep, rng
        self.requests = 0
        self.robots: RobotFileParser | None = None

    def _once(self, url: str) -> Response:
        if self.requests:
            self.sleep(self.delay + self.jitter * self.rng())
        self.requests += 1
        try:
            return self.transport(url)
        except (OSError, ValueError):
            return Response(0)

    def _attempt(self, url: str) -> Response:
        response = self._once(url)
        if response.status == 0 or response.status >= 400:
            self.sleep(self.retry_after)
            response = self._once(url)
        return response

    def _robots(self) -> RobotFileParser:
        if self.robots is None:
            response = self._attempt(f"https://{HOST}/robots.txt")
            parser = RobotFileParser()
            if response.status == 200:
                parser.parse(response.body.decode("utf-8", "replace").splitlines())
            elif response.status in (401, 403) or not 400 <= response.status < 500:
                raise Unavailable(f"robots.txt unavailable (HTTP {response.status})")
            else:
                parser.parse([])
            self.robots = parser
        return self.robots

    def get(self, url: str, language: str) -> tuple[str, bytes]:
        """Returns the final URL and HTML body, or raises Unavailable."""
        robots = self._robots()
        for hop in range(2):
            if not robots.can_fetch(USER_AGENT, url):
                raise Unavailable("robots.txt disallows")
            response = self._attempt(url)
            if 300 <= response.status < 400:
                target = urljoin(url, response.location or "")
                parts = urlsplit(target)
                if (
                    hop
                    or parts.scheme != "https"
                    or parts.hostname != HOST
                    or not parts.path.startswith(f"/{language}/")
                ):
                    raise Unavailable(f"redirect to {target}")
                url = target
                continue
            if response.status != 200:
                raise Unavailable(f"HTTP {response.status}" if response.status else "network")
            if response.content_type != "text/html":
                raise Unavailable(f"not HTML ({response.content_type or 'unknown'})")
            if not response.body or len(response.body) > MAX_BYTES:
                raise Unavailable("invalid size")
            return url, response.body
        raise Unavailable("redirect loop")


@dataclass(frozen=True)
class PageFacts:
    title: str
    heading: str | None
    canonical: str | None
    aliases: tuple[str, ...]
    language: str | None


def normalize(value: str) -> str:
    return " ".join(value.split())


def page_facts(data: bytes) -> PageFacts:
    soup = BeautifulSoup(data, "html.parser")
    title = normalize(soup.title.get_text()) if soup.title else ""
    main = soup.find("main")
    scope = main if isinstance(main, Tag) else soup
    heading = next((text for h in scope.find_all("h2") if (text := normalize(h.get_text()))), None)
    canonical = soup.find("link", rel="canonical")
    href = canonical.get("href") if isinstance(canonical, Tag) else None
    aliases = []
    for link in soup.find_all("link", rel="alternate"):
        if isinstance(link, Tag) and link.get("hreflang"):
            query = parse_qs(urlsplit(str(link.get("href", ""))).query)
            aliases.extend(query.get("alias", []))
    body = soup.find("body")
    language = body.get("data-lang") if isinstance(body, Tag) else None
    return PageFacts(
        title,
        heading,
        href if isinstance(href, str) else None,
        tuple(aliases),
        language if isinstance(language, str) else None,
    )


def page_name(programme: Programme, language: str, requested: str, facts: PageFacts) -> str:
    """The official name, only when title, heading, identity and language all agree."""
    match = TITLE.match(facts.title)
    if not match or match["degree"] != programme.degree:
        raise Invalid("title")
    name = match["name"]
    if facts.heading != name:
        raise Invalid("heading differs from title")
    if facts.canonical != requested and programme.path not in facts.aliases:
        raise Invalid("identity")
    if facts.language not in (None, language):
        raise Invalid(f"page language {facts.language}")
    # Names equal to English are valid official names (for example French "Management").
    if not 1 <= len(name) <= 200 or "|" in name or "&amp;" in name or DEGREE_SUFFIX.search(name):
        raise Invalid("name")
    return name


def review_page(programme: Programme, language: str, fetcher: PoliteFetcher) -> dict[str, Any]:
    url = programme.url(language)
    document: dict[str, Any] = {
        "programmeId": programme.id,
        "lang": language,
        "url": url,
        "finalUrl": None,
        "status": "unavailable",
        "sha256": None,
        "contentSha256": None,
        "titleText": None,
        "h2Text": None,
        "name": None,
    }
    try:
        final, data = fetcher.get(url, language)
    except Unavailable as error:
        return {**document, "reason": str(error)}
    facts = page_facts(data)
    document.update(
        finalUrl=final,
        sha256=hashlib.sha256(data).hexdigest(),
        contentSha256=content_hash(data),
        titleText=facts.title,
        h2Text=facts.heading,
    )
    try:
        return {
            **document,
            "status": "resolved",
            "name": page_name(programme, language, url, facts),
        }
    except Invalid as error:
        return {**document, "status": "invalid", "reason": str(error)}


def duplicates(programmes: list[Programme], documents: list[dict[str, Any]]) -> list[Any]:
    degrees = {p.id: p.degree for p in programmes}
    groups: dict[tuple[str, str, str], list[str]] = {}
    for d in documents:
        if d["status"] == "resolved":
            key = (degrees[d["programmeId"]], d["lang"], d["name"])
            groups.setdefault(key, []).append(d["programmeId"])
    return [
        {"degree": degree, "lang": language, "name": name, "programmeIds": ids}
        for (degree, language, name), ids in sorted(groups.items())
        if len(ids) > 1
    ]


def review_names(
    registry: dict[str, Any],
    fetcher: PoliteFetcher,
    *,
    reviewed_at: str,
    progress: Callable[[str], None] = lambda _: None,
) -> dict[str, Any]:
    programmes = load_programmes(registry)
    anchored = {programme_id for programme_id, _ in ANCHORS}
    if not anchored <= {p.id for p in programmes}:
        raise ValueError("Calibration anchors are missing from the registry")
    # Anchors come first, so a systemic language fallback stops after a handful of requests.
    ordered = [p for p in programmes if p.id in anchored] + [
        p for p in programmes if p.id not in anchored
    ]
    results: dict[tuple[str, str], dict[str, Any]] = {}
    total = len(ordered) * len(LANGUAGES)
    for index, programme in enumerate(ordered):
        for language in LANGUAGES:
            document = review_page(programme, language, fetcher)
            results[(programme.id, language)] = document
            progress(
                f"[{len(results)}/{total}] {language} {programme.id}: "
                f"{document['status']} {document['name'] or document.get('reason', '')}"
            )
        if index + 1 == len(anchored):
            calibration = [
                {
                    "programmeId": programme_id,
                    "lang": language,
                    "expected": expected,
                    "observed": results[(programme_id, language)]["name"],
                }
                for (programme_id, language), expected in ANCHORS.items()
            ]
            if any(c["observed"] != c["expected"] for c in calibration):
                raise CalibrationError(json.dumps(calibration, ensure_ascii=False))
    documents = [results[(p.id, language)] for p in programmes for language in LANGUAGES]
    return {
        "edition": registry["edition"],
        "reviewedAt": reviewed_at,
        "scope": "Official German and French programme display names only",
        "source": (
            "Canonical programme pages https://studies.unifr.ch/{de,fr}/<degree>/<faculty>/<slug>,"
            " derived from each programme's English directory source"
        ),
        "method": {
            "userAgent": USER_AGENT,
            "sequential": True,
            "minimumDelaySeconds": fetcher.delay,
            "retry": f"once after {fetcher.retry_after:g} s, then unavailable",
            "redirects": "at most one, same host and language",
            "robotsTxt": "honoured",
            "checks": [
                "<title> names the programme's own degree",
                "name equals the first content <h2>",
                "canonical URL or hreflang alias identifies the programme",
                "page language matches when declared",
            ],
        },
        "academicRulesChanged": False,
        "priorEditionModified": False,
        "pagesArchived": False,
        "calibration": [
            {"programmeId": programme_id, "lang": language, "name": expected}
            for (programme_id, language), expected in ANCHORS.items()
        ],
        "documents": documents,
        "unresolved": [
            {"programmeId": d["programmeId"], "lang": d["lang"], "reason": d["reason"]}
            for d in documents
            if d["status"] != "resolved"
        ],
        "duplicates": duplicates(programmes, documents),
        "notClaimed": NOT_CLAIMED,
    }


def manifest_names(manifest: dict[str, Any]) -> dict[str, dict[str, str]]:
    names: dict[str, dict[str, str]] = {}
    for d in manifest["documents"]:
        if d["status"] == "resolved":
            names.setdefault(d["programmeId"], {})[d["lang"]] = d["name"]
    return names


def titles_block(names: dict[str, str]) -> list[str]:
    """Always JSON-quoted, which is valid YAML for colons, apostrophes and ampersands."""
    return (
        ["    titles:\n"]
        + [
            f"      {language}: {json.dumps(names[language], ensure_ascii=False)}\n"
            for language in LANGUAGES
            if language in names
        ]
        if names
        else []
    )


def apply_titles(yaml: str, programme_ids: Iterable[str], names: dict[str, dict[str, str]]) -> str:
    """Replaces each programme's ``titles`` right after its single-line ``title``."""
    lines = yaml.splitlines(keepends=True)
    start, end = lines.index("programmes:\n"), lines.index("combinationRules:\n")
    output = lines[: start + 1]
    seen: set[str] = set()
    current: str | None = None
    index = start + 1
    while index < end:
        line = lines[index]
        output.append(line)
        index += 1
        if identifier := re.fullmatch(r"  - id: (\S+)\n", line):
            current = identifier[1]
        elif current and line.startswith("    title: "):
            while index < end and lines[index] == "    titles:\n":
                index += 1
                while index < end and lines[index].startswith("      "):
                    index += 1
            if index >= end or not re.match(r"    [A-Za-z]+:", lines[index]):
                raise ValueError(f"Title is not a single line: {current}")
            output.extend(titles_block(names.get(current, {})))
            seen.add(current)
            current = None
    missing = set(programme_ids) - seen
    if missing:
        raise ValueError(f"Programmes without a title line: {sorted(missing)}")
    return "".join(output + lines[end:])


def git_clean(path: Path) -> bool:
    status = subprocess.run(
        ["git", "status", "--porcelain", "--", path.name],
        cwd=path.parent,
        capture_output=True,
        text=True,
        check=True,
    )
    return not status.stdout.strip()


def apply_manifest(
    manifest_path: Path,
    yaml_path: Path,
    registry: dict[str, Any],
    clean: Callable[[Path], bool] = git_clean,
) -> bool:
    if not clean(yaml_path):
        raise SystemExit(f"{yaml_path.name} has uncommitted changes; commit them before --apply")
    manifest = json.loads(manifest_path.read_text())
    if manifest["edition"] != registry["edition"]:
        raise SystemExit("The manifest belongs to another recipe edition")
    before = yaml_path.read_text()
    after = apply_titles(
        before, [p["id"] for p in registry["programmes"]], manifest_names(manifest)
    )
    if after != before:
        yaml_path.write_text(after)
    return after != before


def main(
    argv: list[str] | None = None,
    transport: Transport = urllib_transport,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--date", default=datetime.now(ZoneInfo("Europe/Zurich")).date().isoformat()
    )
    parser.add_argument("--delay", type=float, default=2.0, help="Seconds between requests (≥ 2)")
    parser.add_argument("--manifest", type=Path, help="Review manifest to write or apply")
    parser.add_argument(
        "--apply", action="store_true", help="Copy a reviewed manifest into recipes.yaml (offline)"
    )
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args(argv)
    root = args.root.resolve()
    registry = json.loads((root / "packages/domain/src/recipe-registry.json").read_text())
    manifest_path = (
        args.manifest or root / f"data/programmes/reviews/{args.date}-programme-names.json"
    )
    if args.apply:
        changed = apply_manifest(manifest_path, root / "data/programmes/recipes.yaml", registry)
        print("recipes.yaml updated; run npm run recipes:build" if changed else "No changes")
        return
    if args.delay < 2:
        raise SystemExit("Keep at least 2 s between requests")
    fetcher = PoliteFetcher(transport, delay=args.delay, sleep=sleep)
    try:
        manifest = review_names(
            registry,
            fetcher,
            reviewed_at=args.date,
            progress=lambda line: print(line, file=sys.stderr, flush=True),
        )
    except (CalibrationError, Unavailable) as error:
        raise SystemExit(f"Aborted before writing anything: {error}") from None
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(
        f"{manifest_path}: {len(manifest['documents'])} pages, "
        f"{len(manifest['unresolved'])} unresolved, {fetcher.requests} requests"
    )


if __name__ == "__main__":
    main()
