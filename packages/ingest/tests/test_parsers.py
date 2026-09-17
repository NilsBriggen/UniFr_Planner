from pathlib import Path
import importlib
import importlib.util

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


def parser():
    assert importlib.util.find_spec("unifr_ingest.parsers"), "Catalogue parsers are not implemented"
    return importlib.import_module("unifr_ingest.parsers")


def fixture(name):
    return (FIXTURES / name).read_text()


def test_public_listing_and_full_pagination():
    page = parser().parse_listing(fixture("listing.html"), 1)
    assert page.reported_count == 3658
    assert list(page.pages)[-1] == 305
    assert len(page.entries) == 12
    course = page.entries[1]
    assert course.source_id == "135192"
    assert course.code == "UE-L17.01683"
    assert course.terms == ("AS-2026",)
    assert course.languages == ("French", "German")
    assert "Friday" in course.schedule_summary
    assert course.lecturer == "Gelshorn Julia"
    assert "Art History" in course.faculty_domain


def test_pagination_has_no_99_page_cap_and_changes_with_count():
    p = parser()
    assert len(p.parse_listing(fixture("listing.html").replace("3658", "12001"), 1).pages) == 1001
    assert len(p.parse_listing(fixture("listing.html").replace("3658", "24"), 1).pages) == 2


def test_listing_duplicates_rejected():
    with pytest.raises(ValueError, match="duplicate"):
        parser().parse_listing(fixture("listing.html").replace("show=135192", "show=133448"), 1)


@pytest.mark.parametrize("html", ["<p>Still loading...</p>", "<html>bad</html>"])
def test_broken_listing_rejected(html):
    with pytest.raises(ValueError):
        parser().parse_listing(html, 1)


def test_detail_multilingual_titles_exact_dates_and_assignments():
    p = parser()
    entry = p.parse_listing(fixture("listing.html"), 1).entries[1]
    detail = p.parse_detail(fixture("detail.html"), entry)
    assert detail.ects == 9
    assert set(detail.course.titles) == {"en", "fr", "de"}
    assert len(detail.meetings) == 8
    assert detail.meetings[0].starts_at.isoformat() == "2026-09-17T13:15:00+02:00"
    assert "Written paper" in detail.assessment
    assert len(detail.assignments) == 2
    assert detail.assignments[0].version == "SA14_MA_P2_bi_v01"
    assert detail.calendar_url.endswith("show=135192")
    assert "Hebdomadaire" in detail.recurrence_summary


def test_block_course_and_unpublished_time():
    p = parser()
    entries = p.parse_listing(fixture("listing.html"), 1).entries
    block = p.parse_detail(fixture("block.html"), entries[2])
    assert len(block.meetings) == 2
    assert block.meetings[1].starts_at.day == 10
    missing = p.parse_detail(fixture("missing-time.html"), entries[3])
    assert missing.meetings[0].unresolved
    assert missing.meetings[0].starts_at is None


def test_missing_ects_remains_unknown_and_detail_changes_detectable():
    p = parser()
    entry = p.parse_listing(fixture("listing.html"), 1).entries[1]
    before = p.parse_detail(fixture("detail.html"), entry)
    after = p.parse_detail(fixture("detail.html").replace("9 ECTS", "ECTS not published"), entry)
    assert after.ects is None
    assert after.detail_hash != before.detail_hash


def test_malformed_session_must_not_disappear():
    p = parser()
    entry = p.parse_listing(fixture("listing.html"), 1).entries[1]
    with pytest.raises(ValueError, match="date"):
        p.parse_detail(fixture("detail.html").replace("17.09.2026", "invalid date"), entry)


def test_calendar_public_dates_and_dst():
    meetings = parser().parse_calendar(fixture("calendar.ics"))
    assert len(meetings) == 8
    assert meetings[0].starts_at.hour == 13
    assert meetings[-1].starts_at.utcoffset().total_seconds() == 3600


def test_calendar_alternating_weeks_exceptions_and_cancelled():
    meetings = parser().parse_calendar(fixture("calendar-edge.ics"))
    assert meetings[0].recurrence == "FREQ=WEEKLY;COUNT=4;INTERVAL=2;BYDAY=MO,WE"
    assert len(meetings[0].excluded_dates) == 1
    assert meetings[1].cancelled
    assert meetings[2].unresolved


def test_detail_semester_mismatch_is_rejected():
    p = parser()
    entry = p.parse_listing(fixture("listing.html"), 1).entries[1]
    with pytest.raises(ValueError, match="semester"):
        p.parse_detail(fixture("detail.html").replace("AS-2026", "SS-2027"), entry)


def test_prerequisites_equivalents_and_cancelled_html_session():
    p = parser()
    entry = p.parse_listing(fixture("listing.html"), 1).entries[1]
    raw = fixture("detail.html").replace(
        "</tbody>",
        """
      <tr><td>Conditions of access</td><td>Prior programming course</td></tr>
      <tr><td>Equivalences</td><td>UE-SIN.00123</td></tr></tbody>""",
        1,
    )
    raw = raw.replace("<td>Cours</td>", "<td>Cours annulé</td>", 1)
    offering = p.parse_detail(raw, entry)
    assert offering.prerequisites == "Prior programming course"
    assert offering.equivalents == "UE-SIN.00123"
    assert offering.meetings[0].cancelled
