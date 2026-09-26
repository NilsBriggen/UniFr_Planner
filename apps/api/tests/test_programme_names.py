import gzip
import json
from pathlib import Path
import subprocess
from typing import Any
from urllib.parse import quote

import pytest

from unifr_api import programme_names as names

ROOT = Path(__file__).resolve().parents[3]
REGISTRY = json.loads((ROOT / "packages/domain/src/recipe-registry.json").read_text())
ANCHOR_NAMES = {
    "bachelor-sci-mathematics": ("Mathematics", "Mathematik", "Mathématiques"),
    "bachelor-digitinf-informatics": ("Computer Science", "Informatik", "Informatique"),
    "bachelor-eco-management": ("Management", "Betriebswirtschaftslehre", "Management"),
}


def page(
    language: str,
    path: str,
    name: str,
    *,
    degree: str | None = None,
    heading: str | None = None,
    canonical: str | None = None,
    alias: str | None = None,
    data_lang: str | None = None,
) -> bytes:
    degree = degree or path.split("/")[0]
    alternate = f"//studies.unifr.ch/en/course-offerings/courses/description.html?alias={quote(alias or path, safe='')}"
    return f"""<!DOCTYPE html><html><head>
<title>{name} ({degree})  | Studies  | Université de Fribourg</title>
<link rel="alternate" hreflang="en" href="{alternate}" />
<link rel="canonical" href="{canonical or f"https://studies.unifr.ch/{language}/{path}"}" />
</head><body data-lang="{data_lang or language}"><nav><h2>Menu</h2></nav>
<main id="main"><div><h2>  </h2><h2> {heading if heading is not None else name}</h2></div></main>
<a rel="canonical" href="https://share.example/">Share</a></body></html>""".encode()


def registry(*extra: tuple[str, str]) -> dict[str, Any]:
    rows = [(pid, en) for pid, (en, _, _) in ANCHOR_NAMES.items()] + list(extra)
    return {
        "edition": "2026-27.2",
        "sources": [
            {
                "id": f"directory-{pid}",
                "url": "https://studies.unifr.ch/en/" + pid.replace("-", "/", 2),
            }
            for pid, _ in rows
        ],
        "programmes": [
            {"id": pid, "degree": pid.split("-")[0], "title": en, "sourceIds": [f"directory-{pid}"]}
            for pid, en in rows
        ],
    }


class Site:
    """A stub transport that records every request."""

    def __init__(self, responses: dict[str, list[names.Response]]) -> None:
        self.responses = responses
        self.requests: list[str] = []

    def __call__(self, url: str) -> names.Response:
        self.requests.append(url)
        if url == "https://studies.unifr.ch/robots.txt":
            return names.Response(200, b"", "text/plain")
        queue = self.responses.get(url)
        if not queue:
            return names.Response(500, content_type="text/html")
        return queue.pop(0) if len(queue) > 1 else queue[0]


def html(body: bytes) -> names.Response:
    return names.Response(200, body, "text/html")


def localized_site(*extra: tuple[str, str, str, str]) -> Site:
    rows = [(pid, *localized) for pid, (_, *localized) in ANCHOR_NAMES.items()] + list(extra)
    responses: dict[str, list[names.Response]] = {}
    for pid, de, fr in ((r[0], r[-2], r[-1]) for r in rows):
        path = pid.replace("-", "/", 2)
        for language, name in (("de", de), ("fr", fr)):
            url = f"https://studies.unifr.ch/{language}/{path}"
            responses[url] = [html(page(language, path, name))]
    return Site(responses)


def fetcher(site: names.Transport, sleeps: list[float] | None = None) -> names.PoliteFetcher:
    record = sleeps if sleeps is not None else []
    return names.PoliteFetcher(site, sleep=record.append, rng=lambda: 0.5)


def test_every_programme_page_follows_its_english_directory_source():
    programmes = names.load_programmes(REGISTRY)
    assert len(programmes) == len(REGISTRY["programmes"]) == 147
    math = next(p for p in programmes if p.id == "bachelor-sci-mathematics")
    assert math.url("de") == "https://studies.unifr.ch/de/bachelor/sci/mathematics"
    teacher = next(p for p in programmes if p.id == "master-teach-teacheredu1-2")
    assert teacher.path == "master/teach/teacheredu1-2"
    renamed = registry()
    renamed["programmes"][0]["id"] = "bachelor-sci-other"
    with pytest.raises(ValueError, match="directory source"):
        names.load_programmes(renamed)


def test_parser_reads_every_archived_english_page_as_its_registry_title():
    sources = {s["id"]: s for s in REGISTRY["sources"]}
    for programme in names.load_programmes(REGISTRY):
        raw = next(p for p in REGISTRY["programmes"] if p["id"] == programme.id)
        archive = next(
            sources[i]["archive"]
            for i in raw["sourceIds"]
            if sources[i]["url"] == programme.url("en")
        )
        facts = names.page_facts(gzip.decompress((ROOT / archive).read_bytes()))
        assert facts.language == "en"
        assert names.page_name(programme, "en", programme.url("en"), facts) == programme.title


@pytest.mark.parametrize(
    ("path", "language", "name"),
    [
        ("bachelor/soc/sociologyfrench", "de", "Soziologie (FR)"),
        (
            "master/soc/sociologyfrench",
            "fr",
            "Sociétés plurielles: cultures, politique et religions",
        ),
        ("master/theo/canonicallicence", "fr", "Théologie (Licence canonique)"),
        ("master/digitinf/dataeco", "fr", "Data Analytics & Economics"),
        ("bachelor/lang/italiandd", "de", "Italienisch [Double Degree]"),
    ],
)
def test_titles_keep_official_tags_colons_ampersands_and_inner_parentheses(path, language, name):
    programme = names.Programme(path.replace("/", "-"), path.split("/")[0], "English", path)
    body = page(language, path, name.replace("&", "&amp;"))
    facts = names.page_facts(body)
    assert names.page_name(programme, language, programme.url(language), facts) == name


def test_pages_must_agree_on_degree_heading_identity_and_language():
    path = "bachelor/sci/mathematics"
    math = names.Programme("bachelor-sci-mathematics", "bachelor", "Mathematics", path)
    url = math.url("de")
    check = lambda body: names.page_name(math, "de", url, names.page_facts(body))  # noqa: E731
    assert check(page("de", path, "Mathematik")) == "Mathematik"
    # English names are valid official names; identity via the hreflang alias suffices.
    assert check(page("de", path, "Mathematics", canonical="https://x.test/")) == "Mathematics"
    for body, reason in [
        (page("de", path, "Mathematik", degree="master"), "title"),
        (page("de", path, "Mathematik", heading="Physik"), "heading"),
        (
            page(
                "de", path, "Mathematik", canonical="https://x.test/", alias="bachelor/sci/physics"
            ),
            "identity",
        ),
        (page("de", path, "Mathematik", data_lang="en"), "language"),
        (page("de", path, "Mathematik &amp;amp; Co"), "name"),
        (b"<html><title>Error</title></html>", "title"),
    ]:
        with pytest.raises(names.Invalid, match=reason):
            check(body)


def test_fetcher_is_sequential_delayed_and_follows_one_same_language_redirect():
    target = "https://studies.unifr.ch/de/bachelor/sci/mathematics"
    moved = "https://studies.unifr.ch/de/studienangebot/courses/description.html?alias=x"
    site = Site(
        {
            target: [
                names.Response(301, location="/de/studienangebot/courses/description.html?alias=x")
            ],
            moved: [html(b"<html></html>")],
        }
    )
    sleeps: list[float] = []
    polite = fetcher(site, sleeps)
    assert polite.get(target, "de") == (moved, b"<html></html>")
    assert site.requests == ["https://studies.unifr.ch/robots.txt", target, moved]
    assert sleeps == [2.5, 2.5]
    for location in [
        "https://studies.unifr.ch/fr/bachelor/sci/mathematics",
        "https://evil.example/de/bachelor/sci/mathematics",
        "http://studies.unifr.ch/de/bachelor/sci/mathematics",
    ]:
        site = Site({target: [names.Response(302, location=location)]})
        with pytest.raises(names.Unavailable, match="redirect"):
            fetcher(site).get(target, "de")
    site = Site(
        {
            target: [names.Response(302, location=moved)],
            moved: [names.Response(302, location=target)],
        }
    )
    with pytest.raises(names.Unavailable, match="redirect"):
        fetcher(site).get(target, "de")


def test_fetcher_retries_once_after_ten_seconds_and_honours_robots():
    target = "https://studies.unifr.ch/de/bachelor/sci/mathematics"
    site = Site({target: [names.Response(500), html(b"<html></html>")]})
    sleeps: list[float] = []
    assert fetcher(site, sleeps).get(target, "de")[1] == b"<html></html>"
    assert sleeps == [2.5, 10.0, 2.5]
    site = Site({target: [names.Response(500)]})
    with pytest.raises(names.Unavailable, match="HTTP 500"):
        fetcher(site).get(target, "de")
    assert site.requests.count(target) == 2
    site = Site({target: [names.Response(200, b"%PDF", "application/pdf")]})
    with pytest.raises(names.Unavailable, match="not HTML"):
        fetcher(site).get(target, "de")

    def offline(url: str) -> names.Response:
        raise OSError("down")

    with pytest.raises(names.Unavailable, match="robots"):
        fetcher(offline).get(target, "de")
    blocked = names.PoliteFetcher(
        lambda url: names.Response(200, b"User-agent: *\nDisallow: /de/\n", "text/plain")
        if url.endswith("robots.txt")
        else html(b"<html></html>"),
        sleep=lambda _: None,
    )
    with pytest.raises(names.Unavailable, match="robots.txt disallows"):
        blocked.get(target, "de")
    assert blocked.requests == 1


def test_unavailable_or_invalid_pages_are_unresolved_and_never_named():
    site = localized_site(
        ("bachelor-soc-sociologyfrench", "Sociology (FR)", "Soziologie (FR)", "Sociologie"),
        ("master-ius-law", "Law", "Rechtswissenschaft", "Droit"),
        ("master-ius-lawparttime", "Law", "Rechtswissenschaft", "Droit"),
    )
    site.responses["https://studies.unifr.ch/fr/bachelor/soc/sociologyfrench"] = [
        names.Response(500)
    ]
    site.responses["https://studies.unifr.ch/de/master/ius/law"] = [
        names.Response(301, location="https://www.unifr.ch/ius/de/")
    ]
    site.responses["https://studies.unifr.ch/fr/master/ius/law"] = [
        names.Response(200, b"{}", "application/json")
    ]
    extra = [
        ("bachelor-soc-sociologyfrench", "Sociology (FR)"),
        ("master-ius-law", "Law"),
        ("master-ius-lawparttime", "Law"),
    ]
    manifest = names.review_names(registry(*extra), fetcher(site), reviewed_at="2026-09-26")
    status = {(d["programmeId"], d["lang"]): d for d in manifest["documents"]}
    assert len(status) == 12
    assert status[("bachelor-soc-sociologyfrench", "de")]["name"] == "Soziologie (FR)"
    assert status[("bachelor-soc-sociologyfrench", "fr")]["status"] == "unavailable"
    assert status[("bachelor-soc-sociologyfrench", "fr")]["sha256"] is None
    assert status[("master-ius-law", "de")]["reason"].startswith("redirect")
    assert status[("master-ius-law", "fr")]["reason"].startswith("not HTML")
    resolved = status[("bachelor-eco-management", "fr")]
    assert resolved["name"] == "Management" and resolved["status"] == "resolved"
    assert resolved["finalUrl"] == resolved["url"]
    assert len(resolved["sha256"]) == len(resolved["contentSha256"]) == 64
    assert resolved["titleText"] == "Management (bachelor) | Studies | Université de Fribourg"
    assert resolved["h2Text"] == "Management"
    assert [(u["programmeId"], u["lang"]) for u in manifest["unresolved"]] == [
        ("bachelor-soc-sociologyfrench", "fr"),
        ("master-ius-law", "de"),
        ("master-ius-law", "fr"),
    ]
    assert manifest["academicRulesChanged"] is False
    assert manifest["pagesArchived"] is False
    assert manifest["duplicates"] == []
    reviewed = names.manifest_names(manifest)
    assert "master-ius-law" not in reviewed
    assert reviewed["bachelor-soc-sociologyfrench"] == {"de": "Soziologie (FR)"}


def test_duplicate_official_names_are_reported_per_degree_and_language():
    site = localized_site(
        ("master-ius-law", "Law", "Rechtswissenschaft", "Droit"),
        ("master-ius-lawparttime", "Law", "Rechtswissenschaft", "Droit"),
    )
    manifest = names.review_names(
        registry(("master-ius-law", "Law"), ("master-ius-lawparttime", "Law")),
        fetcher(site),
        reviewed_at="2026-09-26",
    )
    assert manifest["duplicates"] == [
        {
            "degree": "master",
            "lang": "de",
            "name": "Rechtswissenschaft",
            "programmeIds": ["master-ius-law", "master-ius-lawparttime"],
        },
        {
            "degree": "master",
            "lang": "fr",
            "name": "Droit",
            "programmeIds": ["master-ius-law", "master-ius-lawparttime"],
        },
    ]


def test_failed_calibration_aborts_early_and_writes_nothing(tmp_path):
    (tmp_path / "packages/domain/src").mkdir(parents=True)
    (tmp_path / "packages/domain/src/recipe-registry.json").write_text(
        json.dumps(registry(("master-ius-law", "Law")))
    )
    site = localized_site(("master-ius-law", "Law", "Rechtswissenschaft", "Droit"))
    # A systemic fallback: the German page answers in English.
    site.responses["https://studies.unifr.ch/de/bachelor/sci/mathematics"] = [
        html(page("de", "bachelor/sci/mathematics", "Mathematics"))
    ]
    with pytest.raises(SystemExit, match="Aborted before writing"):
        names.main(
            ["--root", str(tmp_path), "--date", "2026-09-26"], transport=site, sleep=lambda _: None
        )
    assert not (tmp_path / "data").exists()
    assert not any("master/ius/law" in url for url in site.requests)


def test_run_writes_the_review_manifest(tmp_path):
    (tmp_path / "packages/domain/src").mkdir(parents=True)
    (tmp_path / "packages/domain/src/recipe-registry.json").write_text(json.dumps(registry()))
    with pytest.raises(SystemExit, match="2 s"):
        names.main(
            ["--root", str(tmp_path), "--delay", "0.5"],
            transport=localized_site(),
            sleep=lambda _: None,
        )
    names.main(
        ["--root", str(tmp_path), "--date", "2026-09-26"],
        transport=localized_site(),
        sleep=lambda _: None,
    )
    manifest = json.loads(
        (tmp_path / "data/programmes/reviews/2026-09-26-programme-names.json").read_text()
    )
    assert manifest["edition"] == "2026-27.2"
    assert manifest["reviewedAt"] == "2026-09-26"
    assert manifest["unresolved"] == []
    assert names.manifest_names(manifest)["bachelor-sci-mathematics"] == {
        "de": "Mathematik",
        "fr": "Mathématiques",
    }
    assert manifest["notClaimed"]


YAML = """schemaVersion: 1
sources:
  - id: s
    title: Source title
programmes:
  - id: bachelor-sci-mathematics
    subject: mathematics
    title: Mathematics
    sourceIds:
      - s
  - id: master-soc-sociologyfrench
    title: Sociology (FR)
    sourceIds: []
  - id: master-ius-law
    title: Law
    titles:
      de: "Stale"
    sourceIds: []
combinationRules:
  - id: rule
    title: Not a programme
"""


def test_apply_always_quotes_replaces_stale_titles_and_is_idempotent():
    ids = ["bachelor-sci-mathematics", "master-soc-sociologyfrench", "master-ius-law"]
    reviewed = {
        "bachelor-sci-mathematics": {"de": "Mathematik", "fr": "Mathématiques"},
        "master-soc-sociologyfrench": {
            "fr": "Sociétés plurielles: cultures, politique et religions",
            "de": 'Soziologie "FR"',
        },
    }
    once = names.apply_titles(YAML, ids, reviewed)
    assert names.apply_titles(once, ids, reviewed) == once
    assert (
        '    title: Mathematics\n    titles:\n      de: "Mathematik"\n      fr: "Mathématiques"\n    sourceIds:'
        in once
    )
    assert '      fr: "Sociétés plurielles: cultures, politique et religions"\n' in once
    assert '      de: "Soziologie \\"FR\\""\n' in once
    # Law is unresolved in this manifest, so its stale name is removed rather than kept.
    assert "Stale" not in once and "    title: Law\n    sourceIds: []\n" in once
    assert once.endswith("combinationRules:\n  - id: rule\n    title: Not a programme\n")
    for line in once.splitlines():
        if line.startswith("      de: ") or line.startswith("      fr: "):
            assert json.loads(line[10:]) in {n for v in reviewed.values() for n in v.values()}
    with pytest.raises(ValueError, match="without a title"):
        names.apply_titles(YAML, [*ids, "bachelor-missing"], reviewed)
    with pytest.raises(ValueError, match="single line"):
        names.apply_titles(YAML.replace("title: Law\n", "title: >-\n      Law\n"), ids, reviewed)


def test_apply_reads_the_manifest_offline_and_refuses_a_dirty_recipe_file(tmp_path):
    yaml = tmp_path / "recipes.yaml"
    yaml.write_text(YAML)
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "edition": "2026-27.2",
                "documents": [
                    {
                        "programmeId": "master-ius-law",
                        "lang": "de",
                        "status": "resolved",
                        "name": "Rechtswissenschaft",
                    },
                    {
                        "programmeId": "master-ius-law",
                        "lang": "fr",
                        "status": "unavailable",
                        "name": None,
                    },
                ],
            }
        )
    )
    ids = {"edition": "2026-27.2", "programmes": [{"id": "master-ius-law"}]}
    with pytest.raises(SystemExit, match="uncommitted"):
        names.apply_manifest(manifest, yaml, ids, clean=lambda _: False)
    assert yaml.read_text() == YAML
    with pytest.raises(SystemExit, match="edition"):
        names.apply_manifest(manifest, yaml, {**ids, "edition": "2026-27.3"}, clean=lambda _: True)
    assert names.apply_manifest(manifest, yaml, ids, clean=lambda _: True)
    assert '    titles:\n      de: "Rechtswissenschaft"\n    sourceIds: []' in yaml.read_text()
    assert not names.apply_manifest(manifest, yaml, ids, clean=lambda _: True)


def test_git_cleanliness_guard_detects_uncommitted_recipe_changes(tmp_path):
    git = [
        "git",
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "-c",
        "commit.gpgsign=false",
    ]
    subprocess.run([*git, "init", "-q"], cwd=tmp_path, check=True)
    yaml = tmp_path / "recipes.yaml"
    yaml.write_text(YAML)
    assert not names.git_clean(yaml)
    subprocess.run([*git, "add", "recipes.yaml"], cwd=tmp_path, check=True)
    subprocess.run([*git, "commit", "-q", "-m", "init"], cwd=tmp_path, check=True)
    assert names.git_clean(yaml)
    yaml.write_text(YAML + "\n")
    assert not names.git_clean(yaml)
