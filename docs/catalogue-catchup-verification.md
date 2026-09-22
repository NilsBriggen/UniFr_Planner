# Catalogue reliability and completed-course catch-up

Implemented after feedback that the catalogue sometimes did not load and students starting
mid-degree could not record prior ECTS. The existing visual design is retained.

## Changes

- Metadata-only status/facets, indexed SQL filtering/pagination, generation-cached compact
  semester discovery, worker-based programme/timetable checks, bounded requests and retries.
- Saved-course source checks request only relevant canonical codes, deduplicate concurrent
  loads, and never infer removal from incomplete or differently scoped results.
- Dynamic public semester discovery and resumable archive import. Archives have independent
  validated heads, monthly refresh, current-job priority, protected retention and exact
  offering provenance. Public coverage is separate from private raw cache/checkpoints.
- Study start and planning semester are independent. Guided catch-up records individual
  historical or manual courses; duplicate conversion is explicit and pins are respected.
  Earned totals are prominent; completed courses stay out of timetable/workload calculations.
- Optional planning semester and completed records round-trip through existing plan versions,
  account sync, JSON and live shared-plan import. DE/FR/EN interfaces are covered.

## Verification

- 337 frontend unit/component tests and 265 API/domain/ingestion tests, including real
  PostgreSQL migrations, runtime privilege boundaries, locks and transaction controls.
- Desktop and phone browser coverage includes the 2024-start/2026-planning catch-up flow,
  historical multi-select plus manual entry, reload, failed archives, keyboard/Axe checks,
  suggestions, account sync, guest sharing/import, Excel and print exports.
- Independent implementation reviews found and corrected later-semester suggestion loss,
  false removal notices after code-scope changes, and the shared-view semester default.
- Controlled SQLite benchmark: 3,750 current plus 18,750 archived offerings over five years;
  warm p95 status 0.3 ms, facets 0.1 ms, first page 3.9 ms. This is a local read benchmark,
  not a network latency promise.
- Controlled phone browser case: 3,750-course discovery, search editable after 89 ms while
  the index was withheld; a match at position 3,750 was found before client pagination.
- Archive head isolation, complete-source validation, crash resume, source-change rejection,
  monthly refresh and retention have deterministic tests. Desktop and mobile renders were
  inspected; source data in demo/browser tests is explicitly synthetic.

## Data and rollout boundary

Initial archive backfill is intentionally gradual, newest advertised past semester first.
A tested importer does not imply every public semester is already available. The coverage
API reports pending/loading/available/failed states; manual entry works immediately.
No current offering is substituted for missing historical ECTS, and manually entered
credits do not themselves prove degree recognition. Deployment applies additive migrations
and API changes before the web switch, with an exact release archive and verified backup.
