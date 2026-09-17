"""Check the shipped repository's authoritative brand asset and frontend copy."""

from hashlib import sha256
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[3]
SOURCE = REPOSITORY / "assets/brand/unifr-logo.png"
PUBLIC_COPY = REPOSITORY / "apps/web/public/unifr-logo.png"
REQUIRED_SHA256 = "25b77cd630c0719122273e085269bea29df9806ecbd24a3dd1b64d4de23b1ab1"


def test_authoritative_logo_is_shipped_with_required_checksum():
    assert SOURCE.is_file(), "The repository must ship assets/brand/unifr-logo.png"
    assert sha256(SOURCE.read_bytes()).hexdigest() == REQUIRED_SHA256


def test_frontend_logo_is_an_unchanged_copy_of_authoritative_asset():
    assert SOURCE.is_file(), "The authoritative source logo is missing"
    assert PUBLIC_COPY.is_file(), "The frontend build logo is missing"
    assert PUBLIC_COPY.read_bytes() == SOURCE.read_bytes()


def test_brand_provenance_is_shipped_with_source_and_checksum():
    provenance = REPOSITORY / "assets/brand/README.md"
    assert provenance.is_file(), "The repository must ship the brand provenance README"
    content = provenance.read_text(encoding="utf-8")
    assert "https://cdn.unifr.ch/uf/v2.4.5/gfx/logo.png" in content
    assert REQUIRED_SHA256 in content
