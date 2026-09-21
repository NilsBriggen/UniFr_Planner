import gzip
import hashlib
import json

import pytest

from unifr_api import programme_review as review


def test_monitor_loads_compiled_sources_and_preserves_operator_sources(tmp_path):
    path = tmp_path / "monitor.json"
    document = {
        "id": "plan",
        "url": "https://www.unifr.ch/plan",
        "sha256": "a" * 64,
        "programmeIds": ["law"],
    }
    path.write_text(json.dumps({"edition": "2026-27.1", "documents": [document]}))
    assert review.load_sources(path, []) == [document]
    with pytest.raises(ValueError, match="Conflicting"):
        review.load_sources(path, [{**document, "sha256": "b" * 64}])
    with pytest.raises(FileNotFoundError):
        review.load_sources(tmp_path / "missing.json", [])


def test_content_hash_ignores_navigation_scripts_and_formatting_but_detects_changed_credits():
    first = b"<header>Old menu</header><main><h2>Law</h2><p>180 ECTS</p></main>"
    same = b"<header>New menu</header><main><h2>Law</h2>\n<p>180   ECTS</p><script>random()</script></main>"
    assert review.content_hash(first) == review.content_hash(same)
    assert review.content_hash(first) != review.content_hash(first.replace(b"180", b"120"))
    index = b'<main><a href="bachelor/a" name="Law">B</a></main>'
    assert review.content_hash(index) != review.content_hash(
        index.replace(b"bachelor/a", b"bachelor/b")
    )


def test_review_distinguishes_changed_unavailable_and_formatting_and_never_accepts_hashes():
    original = b"<main><p>180 ECTS</p></main>"
    source = {
        "id": "law",
        "url": "https://www.unifr.ch/plan",
        "sha256": hashlib.sha256(original).hexdigest(),
        "contentSha256": review.content_hash(original),
        "programmeIds": ["law"],
    }
    before = dict(source)
    result = review.review_sources([source], lambda _: gzip.compress(original))
    assert result["documents"][0]["status"] == "unchanged"
    result = review.review_sources([source], lambda _: b"<main>\n<p>180 ECTS</p></main>")
    assert result["documents"][0]["status"] == "formatting_change"
    assert result["outcome"] == "success"
    result = review.review_sources([source], lambda _: original.replace(b"180", b"120"))
    assert result["outcome"] == "rejected"
    assert result["affectedProgrammes"] == ["law"]
    assert result["documents"][0]["status"] == "changed_review_required"
    result = review.review_sources([source], lambda _: (_ for _ in ()).throw(OSError("secret")))
    assert result["outcome"] == "failure"
    assert result["documents"][0]["status"] == "unavailable"
    assert "secret" not in json.dumps(result)
    assert source == before


def test_review_includes_new_and_removed_directory_entries_without_modifying_registry():
    report = review.compare_inventory(
        ["https://studies.unifr.ch/en/bachelor/a"], ["https://studies.unifr.ch/en/bachelor/b"]
    )
    assert report == {
        "added": ["https://studies.unifr.ch/en/bachelor/b"],
        "removed": ["https://studies.unifr.ch/en/bachelor/a"],
    }
