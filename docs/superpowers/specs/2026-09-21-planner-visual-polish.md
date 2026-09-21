# Planner visual polish

User request: improve alignment, visual coherence and hierarchy, starting with the semester screen.

The review found mismatched button/input heights, detached calendar controls,
large gaps before useful content, cramped lesson titles and inconsistent card
and form treatments. At 1440px the timetable began 613px down; at 390px it began
813px down, below the bottom navigation.

Implementation sequence:

1. Normalize shared 44px controls, field borders, page gutters and type hierarchy.
   Keep the UniFr palette and existing assets. Make catalogue refresh a quiet
   utility action while preserving source-change alerts.
2. Group the semester heading and primary action; put semester selection, date
   navigation and view switching in one calendar toolbar. Keep export/print in
   its footer and align schedule checks with personal availability below it.
3. Improve lesson typography and day columns; retain dated positioning, conflict
   text, keyboard access, mobile scrolling and the print agenda.
4. Apply the same spacing and control rhythm to catalogue filters, course actions,
   the semester summary and degree-plan cards.
5. Inspect populated desktop and phone screens using disposable browser plans;
   check tablet and narrow/translated layouts, run existing planning and
   accessibility journeys, typecheck/build and lint. Preserve saved plan data.

Changes are local and build on the already-authorized planning improvements.

Verification:

- Inspected populated semester, catalogue and degree-plan screens in isolated
  browser contexts at desktop and phone sizes. The timetable now starts at 450px
  on desktop and 597px on phone, about 163px and 215px higher respectively.
- Checked all three screens at 320px in German, 768px in French and 1024px in
  English: no page overflow and no Axe WCAG A/AA violations.
- All 319 unit tests passed. Desktop and phone planning, catalogue, persistence,
  export, print and shell journeys passed after fixing an accessible field label
  and a transient button-contrast issue. Updated and inspected shell snapshots.
- Typecheck/production build, ESLint and changed-file formatting checks passed.
  The existing large-bundle advisory remains; no dependency changes were made.
