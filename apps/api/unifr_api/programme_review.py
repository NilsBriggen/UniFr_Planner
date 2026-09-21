"""Read-only recipe-source review; observed hashes never replace approved baselines."""

from collections.abc import Callable
import gzip
import hashlib
import io
import json
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup, Tag

from .operations import fetch_document


def decoded_document(data: bytes) -> bytes:
    if data.startswith(b"\x1f\x8b"):
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream:
            data = stream.read(20_000_001)
    if not data or len(data) > 20_000_000:
        raise ValueError("Invalid document size")
    return data


def content_hash(data: bytes) -> str:
    data = decoded_document(data)
    if data.lstrip().startswith(b"%PDF"):
        return hashlib.sha256(data).hexdigest()
    soup = BeautifulSoup(data, "html.parser")
    for tag in soup.select("script,style,nav,header,footer"):
        tag.decompose()
    main = soup.find("main")
    body = main if isinstance(main, Tag) else soup
    text = " ".join(body.get_text(" ", strip=True).split())
    # The directory renders programme names from link attributes with JavaScript.
    links = [(a.get("href"), a.get("name")) for a in body.select("a[href]")]
    text += json.dumps(links, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(text.encode()).hexdigest()


def load_sources(path: Path, configured: list[dict[str, Any]]) -> list[dict[str, Any]]:
    manifest = json.loads(path.read_text())
    documents: dict[str, dict[str, Any]] = {}
    for row in [*manifest["documents"], *configured]:
        if not row.get("id") or not row.get("url", "").startswith("https://"):
            raise ValueError("Invalid recipe source")
        if len(row.get("sha256", "")) != 64:
            raise ValueError("Invalid source digest")
        if row["id"] in documents and any(
            row[key] != documents[row["id"]][key] for key in ("url", "sha256")
        ):
            raise ValueError("Conflicting source baselines")
        documents[row["id"]] = {**documents.get(row["id"], {}), **row}
    if not documents:
        raise ValueError("Empty recipe source manifest")
    return list(documents.values())


def review_sources(
    documents: list[dict[str, Any]], fetch: Callable[[str], bytes] = fetch_document
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    affected: set[str] = set()
    for source in documents:
        item: dict[str, Any] = {"id": source["id"], "programmeIds": source.get("programmeIds", [])}
        try:
            data = decoded_document(fetch(source["url"]))
            digest = hashlib.sha256(data).hexdigest()
            semantic = content_hash(data)
            status = (
                "unchanged"
                if digest == source["sha256"]
                else "formatting_change"
                if semantic == source.get("contentSha256")
                else "changed_review_required"
            )
            item.update(status=status, sha256=digest, contentSha256=semantic)
        except Exception as error:
            item.update(status="unavailable", reason=type(error).__name__)
        if item["status"] in ("unavailable", "changed_review_required"):
            affected.update(item["programmeIds"])
        results.append(item)
    outcome = (
        "failure"
        if not results or any(x["status"] == "unavailable" for x in results)
        else "rejected"
        if any(x["status"] == "changed_review_required" for x in results)
        else "success"
    )
    return {"outcome": outcome, "documents": results, "affectedProgrammes": sorted(affected)}


def compare_inventory(previous: list[str], current: list[str]) -> dict[str, list[str]]:
    return {
        "added": sorted(set(current) - set(previous)),
        "removed": sorted(set(previous) - set(current)),
    }


def main() -> None:
    import argparse
    from urllib.parse import urljoin

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh", action="store_true", help="Fetch source changes; never accept them"
    )
    parser.add_argument("--catalogue", type=Path, help="Optional published catalogue snapshot JSON")
    parser.add_argument("--output", type=Path, help="Write a review report, not recipe changes")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    data = root / "data/programmes"
    registry = json.loads((root / "packages/domain/src/recipe-registry.json").read_text())
    report = json.loads((data / "coverage-report.json").read_text())
    report["sourceReview"] = {"outcome": "not_requested"}
    if args.refresh:
        sources = load_sources(data / "recipe-source-monitor.json", [])
        report["sourceReview"] = review_sources(sources)
        index_url = "https://studies.unifr.ch/en/course-offerings/courses/?ba=1&do=0&ma=1"
        try:
            soup = BeautifulSoup(decoded_document(fetch_document(index_url)), "html.parser")
            entries = soup.select("#course_list .bachelor a, #course_list .master a")
            if not entries:
                raise ValueError("Empty directory response")
            current = [urljoin("https://studies.unifr.ch/en/", str(a["href"])) for a in entries]
            report["directoryChanges"] = compare_inventory(
                [c["sourceUrl"] for c in registry["coverage"]], current
            )
        except Exception as error:
            report["directoryChanges"] = {"status": "unavailable", "reason": type(error).__name__}
    if args.catalogue:
        from unifr_ingest.models import CatalogueSnapshot

        snapshot = CatalogueSnapshot.model_validate_json(args.catalogue.read_bytes())
        unmapped = []
        for programme in registry["programmes"]:
            for variant in programme["variants"]:
                for node_id, selector in variant.get("poolSelectors", {}).items():
                    if not any(
                        assignment.programme == selector["programme"]
                        and assignment.version == selector["version"]
                        and selector["path"] in assignment.paths
                        for offering in snapshot.offerings
                        for assignment in offering.assignments
                    ):
                        unmapped.append(
                            {
                                "programmeId": programme["id"],
                                "variantId": variant["id"],
                                "nodeId": node_id,
                            }
                        )
        report["catalogueReview"] = {
            "snapshotId": snapshot.snapshot_id,
            "unmappedSelectors": unmapped,
        }
    output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        destination = args.output.resolve()
        if destination.is_relative_to(data.resolve()) or destination.is_relative_to(
            (root / "packages").resolve()
        ):
            raise SystemExit("Review output must not overwrite recipe data or code")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(output)
    else:
        print(output, end="")


if __name__ == "__main__":
    main()
