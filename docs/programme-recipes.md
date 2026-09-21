# Programme recipes

The maintained configuration is [`data/programmes/recipes.yaml`](../data/programmes/recipes.yaml).
It covers the 147 Bachelor/Master entries in the official UniFr directory captured on
21 September 2026: all six faculties and the interfaculty offerings. Doctorates and
continuing education are excluded. These are directory entries, not 147 distinct degrees;
programme identity follows the official URL so similar names are not silently merged.

**Coverage is not verification.** There are 293 selectable component variants, but zero
programme entries are fully reviewed across all their variants. Most currently have a
verified directory structure and explicit missing curriculum details. They support
planning; they cannot certify degree completion. The generated
[`coverage-report.json`](../data/programmes/coverage-report.json) lists every gap and its
follow-up curriculum links. Filling those gaps is substantive curriculum research, not
an app implementation step that can safely be replaced with generic credit totals.

## Design and implementation

1. **Authoring:** one YAML registry holds sources, reusable degree structures, component
   variants and conditional combination rules. Ordinary programmes select a shared
   structure; only exceptional obligations need special rules. Stable programme and
   node IDs make changes reviewable. `extends` can share a component definition.
2. **Compilation:** `npm run recipes:build` checks the strict JSON schema, references,
   academic invariants and archived source hashes, then generates the runtime registry,
   coverage report and source-monitor manifest. `npm run recipes:check` is offline and
   fails if checked-in outputs are stale; CI runs it and compiler regression tests.
   Application code never interprets YAML or fetches rules while evaluating a plan.
3. **Composition:** the pure domain composer resolves the selected structure, each
   component and any matching exceptions. It validates roles, credits, subjects,
   repeated components, combination permissions and conflicting overrides. Unknown
   permission stays unresolved. Additional studies remain outside the degree total.
4. **Evaluation:** existing requirement nodes support required courses, credit pools,
   choices, thresholds and non-credit checklists. Course credits cannot be reused.
   Catalogue-backed pools require exact programme, curriculum version and module path
   evidence retained with the selected offering. Course names never establish eligibility.
   Prerequisites are evaluated against completion or earlier planned semesters.
5. **Persistence and UI:** schema 2 saves each component's start semester and exact recipe
   edition. Users choose degree, faculty, main programme, structure and other components,
   preview exceptions/gaps, then explicitly save. Legacy plans retain their original
   templates and requirement IDs. Switching curricula requires an explicit choice;
   existing evidence is never silently reassigned to new nodes.
6. **Maintenance:** automatic catalogue refresh remains independent of approved rules.
   The existing weekly scheduler checks the compiled source manifest. Changes generate
   a review result; they never replace approved hashes or rules automatically.

No MyUnifr credentials, grade/attempt certification or external partner catalogue
importers are introduced. Joint-degree courses can be recorded manually. Individual
recognition decisions and their reasons remain personal evidence, not universal rules.

## Reading and editing a recipe

A `structure` defines slots with role and ECTS, optionally subject restrictions and
whether the slot contributes to the degree. A `programme` identifies the faculty,
degree and subject; `variants` identify component sizes/tracks, applicability and
requirements. A major declares the structures it supports. A variant's
`curriculumVersion` describes the official source; `recipeVersion` in a saved selection
pins the released registry edition, which is a different identifier.

Sources have URLs, retrieval/revision dates and review states. Archived files live in
`data/programmes/sources/2026-09-21`; SHA-256 is computed over decompressed bytes for gzip
archives. `contentSha256` ignores ordinary HTML layout/navigation churn while retaining
text and link changes. PDF changes always require review. Web-only extracts without a
reproducible archive are marked accordingly; never substitute an error response for a
source. Detailed research and conflicts are retained in `research-evidence.json`.

Rules use explicit conditions and actions (`replace_requirements`, `restrict_pool`,
`require_component`, `allow_combination`, `prohibit`). A replacement clears inherited
pool selectors and prerequisites, preventing the general pool from reopening a restricted
minor. More-specific restrictions do not depend on incidental YAML order. Conflicting
matching actions are rejected. Empty eligibility lists mean unknown/empty, never all
courses. Defaults govern safe behaviour; they never invent academic obligations.

Current detailed evidence includes CS, BI minors and CS-specific BI exceptions, Law,
Theology, Psychology and Educational Sciences. Some course mappings, equivalences,
cohort transitions and recognition rules remain incomplete even in these recipes.
Psychology's Clinical and Health specialisation is a separate 30-credit variant; its
requirements do not apply to every Psychology specialisation.

## Semester review procedure

1. Before each semester, inspect the coverage report and generate a source review:

   ```sh
   PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.programme_review \
     --refresh --output /tmp/unifr-programme-review.json
   ```

   Omit `--refresh` for an offline coverage report. Optionally pass
   `--catalogue /path/to/published-snapshot.json` to report unmatched catalogue selectors.
   Network failures are reported as unavailable, not unchanged. The directory baseline
   detects additions/removals, including programmes absent from the previous inventory.
2. Read changed official curricula and transition clauses. Archive successful source
   documents and record retrieval dates, hashes and precise sections. Determine which
   entrant cohorts or continuing students are affected. Never treat annual course
   availability as proof of curriculum applicability.
3. Update shared definitions and only the necessary exceptions. Record unresolved facts
   explicitly. A reviewed status requires complete evidence, not merely a fetched page.
   Update coverage when programmes appear, disappear or are proven aliases.
4. Release a **new** immutable edition for changed academic rules. Retain the previous
   runtime registry and add explicit edition resolution before publishing a second
   edition; the initial release currently ships one recipe edition plus historical
   legacy templates. Do not overwrite the current edition and thereby alter saved plans.
   Unknown editions fail visibly and remain exportable for recovery.
5. Run `npm run recipes:build`, `npm run recipes:check`, `npm run recipes:test`, domain
   and account parity tests, then inspect the diff. Verify representative ordinary and
   exceptional combinations, source gaps and old-plan roundtrips. Publish only the
   reviewed generated artifacts with the application release.

The configuration reduces routine maintenance, but cannot guarantee that once-yearly
review will suffice when UniFr changes curricula mid-year. Semester review is the default;
weekly change detection identifies when earlier review is needed. There is no scheduled
LLM session, autonomous curriculum acceptance or third-party outreach.

## Acceptance and remaining research

Compiler/domain regressions cover malformed configuration, missing sources, invalid
combinations, override conflicts, independent start semesters, extra credits, exact
catalogue eligibility and prerequisite failures. App tests cover persistence parity,
legacy recovery, programme selection and honest gap presentation; browser tests exercise
rendered flows. Verification results for this release are reported in the implementation
handoff, not inferred from the presence of test files.

Next content work is explicit: review every linked curriculum, map course/module
eligibility, record applicable cohorts and transitions, and resolve the listed conflicts.
Only then should a programme move from planning support to fully reviewed requirements.
