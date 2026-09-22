# Layout corrections — 22 September 2026

The earlier horizontal-overflow and accessibility checks missed visible collisions. These corrections are backed by measured element positions and inspected browser screenshots.

## Corrected

- The compact catalogue semester card inherited the desktop sticky `top: 20px` offset after switching to relative positioning. It overlapped the next control by 8px. Resetting the offset restores the intended 12px gap, with the card collapsed or expanded.
- The phone timetable forced semester selectors to 100px, cutting off localized names. The selector now sizes to its content and the toolbar wraps naturally.
- Course editing controls now switch to a single column when two columns cannot fit their semester labels.
- Requirement badges occupy their own line. Override forms now use the same responsive field layout as programme setup, with space before the following checklist.

## Verification

The new browser checks reproduced the card overlap and clipped semester label before the fix. All 80 targeted desktop/phone browser checks then passed; the final 18 layout checks also passed after the last spacing adjustment. TypeScript, lint and formatting passed.

A rendered sweep covered five pages, DE/FR/EN and widths 320, 390, 768, 1024 and 1440: 75 layouts with no overlapping sibling boxes or page-level horizontal overflow. Additional requirement-form screenshots were inspected after the final spacing adjustment. The checks exclude intentional containment and timetable event positioning; long native dropdown options can still truncate their selected text.

## Inspected views

- [Phone course catalogue](2026-09-22-layout-fixes/catalogue-en-390.png)
- [Phone timetable](2026-09-22-layout-fixes/timetable-en-390.png)
- [Phone requirement override](2026-09-22-layout-fixes/override-en-390.png)
- [Desktop requirement override](2026-09-22-layout-fixes/override-en-1440.png)
