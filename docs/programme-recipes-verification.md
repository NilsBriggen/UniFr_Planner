# Programme recipe implementation verification — 21 September 2026

Implemented from base `c3b6a410b48d3ad9ff3aba4b3a39f05297c47607` in an isolated
clone, reviewed independently, then integrated into the working repository.

## Evidence

- `npm test`: 308 tests pass in 23 files.
- `npm run recipes:test`: five compiler tests pass, including false-reviewed
  metadata, inherited evidence and directory inventory coverage controls.
- `npm run recipes:check`: approved archives and generated artifacts match;
  147 directory entries, 293 variants, zero fully reviewed programmes.
- `pytest` with a disposable PostgreSQL 17.6 instance: 209 tests pass,
  including real account persistence, concurrency and role boundaries.
- TypeScript typecheck, ESLint, Prettier, Python mypy, Ruff check/format and
  `git diff --check` pass. The existing stale OpenAPI artifact was regenerated;
  pre-existing parser-test formatting was normalized.
- Production web build passes. Vite reports a large shared bundle
  (about 1.33 MB uncompressed / 266 KB gzip); no loading-performance claim is made.
- Browser checks run against fresh demo servers at an isolated port:
  `E2E_PORT=4183 npm run test:e2e -- --project=desktop --workers=3` and the
  corresponding `--project=phone` command each pass 48 tests. One production-only
  operations check per project is intentionally skipped.
- Visually inspected desktop and phone CS/BI and Law screenshots. All-faculty
  browser tests save/reopen representative programmes from six faculties and
  the interfaculty group. DE/FR/EN recipe flows include accessibility checks,
  independent minor start semesters, exceptions and visible unresolved evidence.

Separate device runs use fresh account backends. A combined run exhausted the
shared test client IP's real authentication budget. The CI now uses separate
runs; production rate limits were not weakened. The connected catalogue test
now waits for the intended changed snapshot instead of an unrelated in-flight
response. Browser checks refuse to reuse an already-running deployment.

## Review outcomes

Independent review approved the composer/compiler and application integration
after regressions addressed:

- Replacement requirements could retain a general elective selector.
- Unsupported teaching-subject pairs and replacement credit contradictions.
- An unselected unresolved alternative could taint a completed selected branch.
- Coverage counts could call unresolved evidence fully reviewed.
- Courses could count toward both the degree and additional studies.
- Rules targeting an unselected minor variant could appear in the preview.

No production deployment, live production scheduler run, outreach or account
migration was performed. The source monitor is verified with changed/unchanged,
formatting-only, unavailable and directory-addition controls, plus archived
source evidence; future live source availability is not guaranteed.

## Content boundary

This release implements the configuration mechanism and catalogue-wide planning
coverage. **Every one of the 147 programme entries still has documented research
or review gaps.** Detailed curriculum evidence exists for selected programmes,
but this is not complete academic verification of all degrees. Missing curricula,
course mappings, cohort applicability and source conflicts remain visible in
`data/programmes/coverage-report.json`. The UI cannot certify completion through
an unresolved rule. See `programme-recipes.md` for the complete review workflow.
