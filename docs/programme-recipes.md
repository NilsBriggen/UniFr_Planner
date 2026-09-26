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
dated directories under `data/programmes/sources/` (currently `2026-09-21` and
`2026-09-24`); SHA-256 is computed over decompressed bytes for gzip archives.
`contentSha256` ignores ordinary HTML layout/navigation churn while retaining
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

## Programme names and search aliases

A programme's `title` is its English directory name. `titles.de` and `titles.fr` are the
official German and French names, taken from each programme's canonical page
`https://studies.unifr.ch/{de,fr}/<degree>/<faculty>/<slug>` (the English directory source
URL with the language swapped). The review of 26 September 2026 is recorded in
[`reviews/2026-09-26-programme-names.json`](../data/programmes/reviews/2026-09-26-programme-names.json).
Names are display metadata only: they label programmes in the UI and make the setup search
work in every language, but they are never curriculum, eligibility or completion evidence.

The maintainer tool fetches and validates the names; it never runs in CI:

```sh
PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.programme_names
PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.programme_names --apply
npm run recipes:build
```

- The first command makes about 295 sequential requests (robots.txt, then two pages per
  programme) with at least 2 s plus jitter between them and a project User-Agent, which
  takes about 13 minutes. It follows at most one same-host, same-language redirect and
  retries an HTTP error once after 10 s. A missing page answers HTTP 500, so an error
  page is never mistaken for a name.
- A name is accepted only when the `<title>` names the programme's own degree, the first
  content `<h2>` repeats it, the canonical URL or hreflang alias identifies the programme
  and the page language matches. Anything else is listed under `unresolved`, gets no
  `titles` entry and falls back to English. The run stops early only when the anchor
  names (Mathematik/Mathématiques, Informatik/Informatique, Betriebswirtschaftslehre) fail,
  which would mean the site no longer serves localized pages.
- The manifest records each page's URL, final URL, SHA-256, `contentSha256`, title, heading
  and name. The pages themselves are not archived and not added to the weekly source
  monitor, so **re-run the tool at every semester review** and inspect the diff.
- The manifest is written to `data/programmes/reviews/<date>-programme-names.json`; review
  and commit it first. `--apply` then works offline from that manifest (pass `--manifest`
  or `--date` for an earlier review). It refuses to run while `recipes.yaml` has
  uncommitted changes and writes JSON-quoted `titles` right after each programme's
  `title`; running it twice changes nothing. `scripts/compile-recipes.test.mjs` checks that
  the YAML titles equal the manifest names; update the manifest path there with each review.

Official names are stored exactly as published, even when they equal the English name
(French "Management") or carry asymmetric tags ("Soziologie (FR)" but "Sociologie").
Duplicate names, such as the German "Rechtswissenschaft" for both Law masters, are listed
in the manifest and left as published; any disambiguator would be invented.

`aliases` are hand-curated search terms, never displayed: colloquial abbreviations that
students type, such as `BWL` for Management and `VWL` for Economics. They must not repeat
a title, and they are unrelated to the coverage disposition `alias`.

Configured plans render programme labels from their saved selection in the current UI
language, including plans on the archived edition. Only plans created in German or French
from now on save a localized default plan name and legacy `programme` label.

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
   Re-run the programme names tool (see above), since renamed pages are not monitored weekly.
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
   Unknown editions fail visibly and remain exportable for recovery. Display-only metadata
   (`programmes[].titles`, search `aliases` and sources that no programme or rule cites)
   may be corrected in the current edition; academic content may not.
   `scripts/compile-recipes.test.mjs` pins a digest of the current edition's academic
   projection, so any other change fails until a new edition adds its own pin. Archived editions are
   never edited; at load time they receive the current names by programme id wherever
   their English title is unchanged.
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
