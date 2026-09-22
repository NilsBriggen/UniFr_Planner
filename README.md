# UniFr Planner

UniFr Planner helps students build a semester timetable and track their studies from
public University of Fribourg course data. It works without an account, with German,
French and English interfaces.

- **Timetable:** week, day and agenda views, known conflicts, personal availability,
  and print/calendar/spreadsheet downloads.
- **Courses:** semester search, course details and lesson previews, source-backed
  recommendations, and direct semester allocation.
- **My studies:** degree configuration, completed courses, requirements, scenarios
  and plan backups. Settings contains optional accounts and explicit synchronization.

Plans are saved locally in the browser. Export a JSON backup before clearing browser
data or changing devices. Another tab cannot silently overwrite a newer saved plan:
conflicts offer the latest version or a separate copy of the attempted edit.

The app is a planning aid. Missing dates, unknown credit values and unreviewed academic
requirements remain explicit; a programme appearing in the directory does not certify
its rules or degree completion. Official regulations remain authoritative.

## Develop and operate

See [development](docs/development.md) for installation, architecture, checks and
local fixture servers. [Production operations](docs/operations.md) covers immutable
releases, protected configuration, backups and rollback; start configuration from
[the environment example](deploy/production.env.example), stored outside Git.

## Data and feature documentation

- [Catalogue ingestion and publication](docs/catalogue-operations.md): the maintained
  importer, source validation, atomic snapshots and rejection handling. Pagination is
  discovered from source responses; use this importer rather than a fixed-page scrape.
- [Programme recipes](docs/programme-recipes.md): versioned defaults and exceptions,
  source evidence, review gaps and offline compilation.
- [Guest planning](docs/guest-planner.md), [catalogue interface](docs/catalogue-interface.md),
  [suggestions](docs/suggestions.md), and [accounts](docs/accounts.md).
- [Simplicity implementation plan and acceptance](docs/superpowers/plans/2026-09-22-simplicity.md).
