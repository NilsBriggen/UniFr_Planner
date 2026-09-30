"""Check the planner's own brand assets and frontend copy."""

from hashlib import sha256
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[3]
SOURCE = REPOSITORY / "assets/brand/planner-mark.png"
PUBLIC_COPY = REPOSITORY / "apps/web/public/planner-mark.png"


def test_project_logo_replaces_the_university_asset():
    assert SOURCE.is_file(), "The repository must ship its own planner mark"
    assert not (SOURCE.parent / "unifr-logo.png").exists()
    assert not (PUBLIC_COPY.parent / "unifr-logo.png").exists()


def test_frontend_logo_is_an_unchanged_copy_of_authoritative_asset():
    assert SOURCE.is_file(), "The authoritative source logo is missing"
    assert PUBLIC_COPY.is_file(), "The frontend build logo is missing"
    assert PUBLIC_COPY.read_bytes() == SOURCE.read_bytes()


def test_brand_provenance_is_shipped_with_source_and_checksum():
    provenance = REPOSITORY / "assets/brand/README.md"
    assert provenance.is_file(), "The repository must ship the brand provenance README"
    content = provenance.read_text(encoding="utf-8")
    assert SOURCE.name in content
    assert sha256(SOURCE.read_bytes()).hexdigest() in content
