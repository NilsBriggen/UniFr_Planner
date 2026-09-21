# Assisted semester planning

User-authorized scope: make finding, choosing and reviewing courses easier, using Computer Science + Business Informatics for the walkthrough.

- Keep the catalogue and semester routes as canonical homes. In a saved plan, default the catalogue to a semester, show programme-related courses first, and offer explicit controls for all courses, clash-free courses and already added courses. Apply filtering/ranking over the complete matching catalogue, before pagination.
- Use saved programme requirements for source-backed matches. If only a personal programme label exists, label subject matches as related subjects and link to programme configuration; never claim degree eligibility. Missing dates or prerequisite evidence stays unknown.
- Show actual lesson dates/times/rooms and conflicts before adding. Keep a running semester sidebar with ECTS, selected courses, unresolved dates and links to the timetable and existing alternative suggestions. Allow removing an unpinned course from the semester without deleting it from the plan.
- Replace stacked week cards with a time-positioned weekly grid, including overlapping lanes, midnight splitting, stable course colours and visible clash text. Retain day/agenda views, print and export. Mobile can scroll the week within the page.
- Keep useful actions and summaries above advanced forms. Retain German/French/English, keyboard navigation, state feedback and IndexedDB save semantics.

Verification: exercise a several-course journey on desktop and phone, including programme filtering beyond the first page, incomplete timing, conflicts, removal, source-unavailable states, reload, print/export and accessible overflow. Pure layout tests cover touching events, simultaneous overlaps and overnight intervals. Changes build on the existing local planning-flow work.
