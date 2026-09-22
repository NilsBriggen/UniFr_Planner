# My studies simplicity slice

## Behavior

- The requirements page shows a compact saved-studies summary and opens the full chooser only through **Edit studies**.
- Requirement trees keep their top level visible and collapse nested variants/modules, while recipe review gaps remain visible.
- Editing a configured degree preserves independently saved minor cohort dates. Setup-only major-date propagation remains available.
- Setup mode now exposes prohibited degree composition as an accessible alert instead of silently withholding the hidden preview.
- The planning semester is expanded by default. Other semester, completed, and unscheduled cards are collapsed, with known ECTS and unknown-ECTS counts in each summary.
- Scenario, backup, export, print, and import controls share one **Plan settings and backups** disclosure. File import is primary; pasted JSON is an advanced disclosure.
- `SaveStatus` and `Download` live in `planner/PlanControls.tsx`; Planner keeps compatibility re-exports, while direct consumers use the leaf module.

## Selector notes

- Semester containers are `details[aria-label="<semester label>"]` and expose role `group`; the planning semester has the `open` attribute.
- Completed and Unscheduled are also collapsed `details` groups.
- Tools are `details[aria-label="Plan settings and backups"]` (localized) and are closed initially.
- The requirements summary exposes an **Edit studies** button; the degree chooser is absent until it is pressed.
- JSON file input remains labelled **Plan file**. Pasted JSON is inside the closed **Plan JSON** disclosure.

## Verification

- `NODE_OPTIONS=--no-experimental-webstorage npm test`: 36 files, 376 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Prettier passed for all changed files. The repository-wide `npm run format:check` still reports the unchanged baseline file `apps/web/src/planner/SemesterCalendar.test.tsx`.
- `git diff --check`: passed.
