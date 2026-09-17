# Public fixture provenance

Retrieved on 2026-09-17 from the public UniFr timetable over HTTPS, without credentials,
cookies or MyUnifr access. Raw responses retain public university navigation and course
content; no private student information is present. Files are test snapshots, not current
academic advice. Retrieval used sequential `curl -fsSL` requests.

The website's public `assets/components/timetable/app.js` documents the listing form,
connector and 12-item pagination. Listing POST fields were:

```
texte=&jour=&heure=&domaines=&semestres=&langues=&niveaux=&facultes=&public=&viewer=//www.unifr.ch/timetable/en/course.html&page=1
```

For the changed-count fixture, `page=4` was used instead. Both were POSTed to
`https://www.unifr.ch/timetable/assets/components/timetable/connector.php?action=getlist`.

| File | Public URL / purpose | SHA-256 |
| --- | --- | --- |
| listing.html | Connector, page 1; 3,658 results, multiple sessions, block and missing-time listings | e19e007a674aa02de81cd9dcab67472b3ecaf3433b64597b592b18bd41547170 |
| listing-changed-count.html | Connector, page 4; 3,660 results, actual inconsistent crawl count | 7ce6bfdc0bc65770e8c374c3d02a1ebbcc06806c6357a18275c8996afb8864cc |
| detail.html | https://www.unifr.ch/timetable/en/course.html?show=135192 | 0a6b682a588cec7db0f3da41cd1ef969563d84133c344e70486916f01b481fcd |
| block.html | https://www.unifr.ch/timetable/en/course.html?show=135545 | bf27569d0bff02cbf7f187997b1d1cfccfae9a6bd574d5691539c4d1510313fb |
| missing-time.html | https://www.unifr.ch/timetable/en/course.html?show=132777 | b840ce31a85162a1fd4ea1ced3b01bc32e287f5d733cd0b85df27893fb527408 |
| calendar.ics | https://www.unifr.ch/timetable/en/calendar.html?show=135192 | 99a76170aa001da9026c237e9efaad85506294670ec4cad5f12f9e3f3447e5c3 |

`calendar-edge.ics` is explicitly synthetic: it models biweekly Monday/Wednesday
recurrence, an excluded occurrence, a cancelled session and a date with unpublished time.
Its SHA-256 is `249993796732c5fe6cfc1eab3e2045e70d8a957a0c06ba09dedaeaefa0d6535b`.

Tests deliberately mutate in-memory copies of public HTML to represent >99 pages,
changed counts, duplicate IDs/code+term, missing ECTS, modified sessions, wrong semester,
malformed dates, prerequisite/equivalence fields, and cancelled sessions. The deliberately
broken detail is `<html>deliberately broken</html>`; no mutated fixture is presented as
an unaltered capture from the university. Public dates are tested as exact occurrences;
the calendar snapshot verifies the autumn transition from UTC+2 to UTC+1.
