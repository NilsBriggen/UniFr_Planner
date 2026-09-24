# Student audit remediation — 24 September 2026

The eight student journeys exposed disconnected course discovery, unclear credit totals, fragile browsing context and incomplete print coverage. This release connects those paths, preserves saved plans and their curriculum edition, and adds reviewed public-source course mappings. It remains a planning aid; partial rules and individual recognition are not a degree certificate.

## Changes

| Audit area | Result |
|---|---|
| W01 Programme discovery | Separate known open requirements, published programme listings, and all courses; exact programme/version/path mappings and visible stage/context. Programme relevance never implies academic recognition. |
| W02 Academic content | Versioned source review for all eight audited paths, including Math60, French Psychology, Law IUR I and Biology/Chemistry mappings. Existing 2026-27.1 stays immutable; current 2026-27.2 is an explicit preview/save upgrade. |
| W03 Credits | Per-course reconciliation of recorded, selected, mapped and unallocated credits. Prior-study totals are context only and never satisfy credits or prerequisites. Annual course ECTS are distinguished from semester workload. |
| W04 History | Per-term pending/failed/available status, explicit availability recheck, and independent manual history entry. The importer safely restarts a moving index and reuses only matching recent validated details; complete coverage and unchanged final index remain mandatory. |
| W05 Setup | Shared study start, optional completed-course onboarding, preserved custom name and semester horizon through Back/Review. |
| W06 Terms | Explicit offering and target semester; extend existing plans without replacing scenarios/evidence. Requested-term details and recurrence previews lead with the chosen semester. |
| W07 Browsing | Controlled Apply/Clear filters, visible applied choices and subject labels, remembered plan/scenario routes, preserved detail return and scroll. |
| W08 Attendance | Personal exclusions remain provisional. The same source meetings feed discovery, calendars, suggestions and exports. Internal source overlaps, external course clashes and unavailable periods stay distinct; changed choices restore all sessions with a visible warning. |
| W09 Print scope | Separate weekly calendar, full semester agenda and course/ECTS roster, with repeated context and page numbers. |
| W10 Print coverage | Full named course manifest, undated-course reasons and complete lesson details. Short/dense calendar blocks use same-page references; dense days have their own page. |
| W11 Language and requirements | Browser-language initialization with saved-choice priority, readable review gaps and next steps, localized date/print controls. Official course/source titles remain available. |
| W12 Small screens | Day controls, complete date list including evening classes, semester-focused board and published-date preview with keyboard focus management. |
| W13 Source freshness | Durable check completion/time/no-change feedback; prior published data remains distinct from rejected refreshes. Printed publication dates are attributed only to matching saved snapshots. |
| W14 Verification | Source-shaped A–H journeys, real print buttons/PDFs, browser/device regressions, ordinary PDF viewers, measured discovery latency and independent review. |

## Source boundaries

The source review manifest is `data/programmes/reviews/2026-09-24-curriculum-review.json`; archived public files and their hashes accompany the recipes. All 147 programmes still retain documented review gaps. No degree was promoted to fully reviewed.

- The current CS source still advertises 120 credits while its validation packages total 123. The BI summary minima total 181.5 against its advertised 180. Neither discrepancy is silently corrected.
- MSc Economics and CS, History and German still lack reviewed exact annual mappings for some audited courses. Chemistry options, replacements and certain laboratories need individual evidence.
- French Psychology methods courses L25.01115/L25.01116 require specific thesis conditions and supervisor approval. Independent review caught the French code entering automatic allocation; both are excluded until that evidence can be represented.
- Public timetable records do not establish which Law/Statistics groups each student may omit. Personal choices remain provisional and original source sessions remain intact.
- Earlier study totals without a transcript remain pending context. Historical catalogue recovery depends on stable complete public listings and details.

## Evidence

Eight source-shaped plans use all 41 exact audited course codes from published snapshot `173b2163-8e84-43c6-9891-0dbd649a8108` (23 September). This is newer than the original audit snapshot, so these are regression reconstructions rather than a repeat of the blind first-use experiment. The retained `.1` plans completed 32 populated views and 24 actual print-button exports. Current `.2` checks covered all eight planning/print paths; seven degree configurations evaluated with explicit partial coverage, while the Biology transfer profile retained its 2024 start outside the newly reviewed entrant window and correctly refused evaluation. The original saved `.1` remains available. The MSc CS reconstruction was corrected to the actual optional-minor structure before its final check. All scopes contain their courses; undated courses remain explicit. The Law plan retains 274 dates and 96 dated overlaps: 52 external, 44 internal.

The new mappings account for the selected 30-credit CS/Math plan, 30-credit French Psychology plan and 60-credit Law subject plan while keeping their academic completion unresolved. Missing mappings in other plans remain visible.

Original A/H PDF text loss did not reproduce in Chromium 153, Firefox 156 or Okular 26.08.1. Chromium/Firefox checks cover fit, 100% and 200%; Okular used its ordinary default view. New dense Law printouts were also inspected in Chromium/Firefox. Some raster previews show missing glyphs or gradient artifacts; no font fix is claimed from those renderer-specific images. Native OS print-dialog saving and physical printers were not tested.

Three fresh-browser trials, each opening a saved plan before the first/repeat course visit, settled in 2.88–2.94 seconds against the local development UI and real production read API. The discovery response was approximately 733 KB compressed / 12.3 MB decoded, about 0.50 seconds of measured request time. These measurements do not flush server caches or simulate a slow phone and do not establish universal performance.

Independent reviews covered archive/account/edition handling, source interpretation and UI integration. Six UI issues plus an unavailable-edition recovery crash and a conditional-credit error were corrected with regression controls. Full phone acceptance additionally exposed scope-label overlap: an adjacent label intercepted the tapped option. Separate full-width controls now retain their own visible hit targets at320/390/680 pixels in all three languages. Existing German shell image baselines were retained; explicit browser-language tests cover DE/FR/EN and saved preference.

Final validation and release evidence are recorded in the accompanying deployment report. Detailed local evidence is retained in `.superpowers/audit-remediation/` and the original eight-student audit remains unchanged in the Codex visualization folder.
