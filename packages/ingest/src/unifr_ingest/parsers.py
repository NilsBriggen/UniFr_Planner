"""Pure parsers for public timetable fragments, detail HTML and iCalendar."""

import hashlib
import json
import re
from datetime import datetime
from html import escape
from html.parser import HTMLParser
from zoneinfo import ZoneInfo
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag
from icalendar import Calendar  # type: ignore[import-untyped]

from .models import Course, ListingEntry, ListingPage, Meeting, Offering, ProgrammeAssignment

BASE = "https://www.unifr.ch/timetable/en/"
ZURICH = ZoneInfo("Europe/Zurich")


def digest(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def clean(tag: Tag | None) -> str:
    return " ".join(tag.get_text(" ", strip=True).split()) if tag else ""


def language_codes(labels: tuple[str, ...]) -> tuple[str, ...]:
    # ListingEntry retains the original source labels and fingerprint. Do not guess
    # the languages behind unspecified "Bilingual" or "Other" labels.
    known = {
        "French": ("fr",),
        "German": ("de",),
        "English": ("en",),
        "Italian": ("it",),
        "Spanish": ("es",),
        "Rhaeto-rumantsch": ("rm",),
        "Bilingual f/d": ("fr", "de"),
        "Bilingual d/f": ("de", "fr"),
        "English and/or German": ("en", "de"),
        "English and/or French": ("en", "fr"),
        "fr/de/en": ("fr", "de", "en"),
    }
    return tuple(dict.fromkeys(code for label in labels for code in known.get(label, ())))


class DetailStructure(HTMLParser):
    """Check source boundaries before BeautifulSoup repairs incomplete markup.

    Only document roots and the course's structural containers are tracked;
    unrelated navigation markup and HTML void elements are not validated.
    """

    containers = {"article", "aside", "table", "thead", "tbody", "tr", "td", "th"}

    def __init__(self) -> None:
        super().__init__()
        self.stack: list[str] = []
        self.seen: set[str] = set()

    def tracked(self, tag: str) -> bool:
        return tag in {"html", "body", "main"} or ("main" in self.stack and tag in self.containers)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.tracked(tag):
            self.stack.append(tag)
            self.seen.add(tag)

    def handle_endtag(self, tag: str) -> None:
        if self.tracked(tag):
            if not self.stack or self.stack[-1] != tag:
                raise ValueError(f"Incomplete detail: unexpected closing {tag}")
            self.stack.pop()

    def validate(self, raw: str) -> None:
        self.feed(raw)
        self.close()
        if self.stack or not {"html", "body", "main", "article", "aside"} <= self.seen:
            raise ValueError("Incomplete detail: missing or unclosed course/document structure")


def parse_listing(raw: str, number: int, page_size: int = 12) -> ListingPage:
    soup = BeautifulSoup(raw, "html.parser")
    count = soup.select_one('input[name="nbrresultats"]')
    value = str(count.get("value", "")) if count else ""
    if not value.isdigit():
        raise ValueError("Missing numeric result count (loading or malformed listing)")
    entries = []
    seen = set()
    for card in soup.select(".content-teaser--inner"):
        match = re.search(r"show=(\d+)", str(card.get("onclick", "")))
        if not match:
            raise ValueError("Missing source ID")
        source_id = match[1]
        if source_id in seen:
            raise ValueError(f"duplicate source ID {source_id}")
        seen.add(source_id)
        header = card.select_one("h4")
        small = card.select_one("h4 small")
        parts = clean(small).split("|")
        if len(parts) != 3 or header is None:
            raise ValueError(f"Malformed course header {source_id}")
        terms = tuple(re.findall(r"(?:AS|SS|SA|SP|HS|FS)-\d{4}", parts[1]))
        if small:
            small.extract()

        def icon_text(css: str) -> str:
            icon = card.select_one(css)
            return clean(icon.parent) if icon and isinstance(icon.parent, Tag) else ""

        data = dict(
            source_id=source_id,
            code=parts[2].strip(),
            title=clean(header),
            terms=terms,
            schedule_summary=clean(card.select_one(".calendar_span")),
            lecturer=icon_text(".gfx-user"),
            faculty_domain=icon_text(".fa-university"),
            languages=tuple(x.strip() for x in icon_text(".fa-language").split(",") if x.strip()),
            detail_url=BASE + "course.html?show=" + source_id,
        )
        if not data["code"] or not data["title"] or not terms:
            raise ValueError(f"Missing required listing fields {source_id}")
        entries.append(
            ListingEntry.model_validate(
                {**data, "fingerprint": digest(json.dumps(data, sort_keys=True))}
            )
        )
    return ListingPage(
        number=number,
        reported_count=int(value),
        page_size=page_size,
        entries=tuple(entries),
        raw_hash=digest(raw),
    )


def parse_detail(raw: str, entry: ListingEntry) -> Offering:
    # The source CMS sometimes truncates rich-text formatting inside a cell
    # (observed in a bibliography). An unfinished quoted attribute would swallow
    # otherwise complete later sections. Escape only unfinished inline tags at
    # an explicit cell boundary; never invent structural tags or missing bytes.
    markup = re.sub(
        r"<(?:a|abbr|b|br|em|font|i|small|span|strong|sub|sup|u)\b[^<>]*(?=</td\s*>)",
        lambda match: escape(match[0]),
        raw,
        flags=re.IGNORECASE,
    )
    DetailStructure().validate(markup)
    soup = BeautifulSoup(markup, "html.parser")
    main = soup.select_one("main") or soup
    advertised = {
        str(tag["data-tabcordion-toggler"]) for tag in main.select("[data-tabcordion-toggler]")
    }
    available = {
        str(tag["data-accordion-content"]) for tag in main.select("[data-accordion-content]")
    }
    if "tab-1" not in advertised or not advertised <= available:
        raise ValueError("Incomplete detail: missing advertised course section")
    fields = {}
    for row in main.select("tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) == 2:
            fields[clean(cells[0])] = clean(cells[1])
    if fields.get("Code") != entry.code or not main.select_one("h2"):
        raise ValueError(f"Detail identity/structure mismatch {entry.source_id}")
    detail_terms = tuple(re.findall(r"(?:AS|SS|SA|SP|HS|FS)-\d{4}", fields.get("Semester", "")))
    if set(detail_terms) != set(entry.terms):
        raise ValueError(f"Detail semester mismatch {entry.source_id}")
    titles = {
        lang: fields[label]
        for label, lang in (("French", "fr"), ("German", "de"), ("English", "en"))
        if fields.get(label)
    }
    titles.setdefault("en", clean(main.select_one("h2")))
    ects_match = re.search(r"(\d+(?:[.,]\d+)?)\s*ECTS", clean(main.select_one("aside")))
    meetings = []
    for row in main.select('[data-accordion-content="tab-2"] tbody tr'):
        cells = row.find_all("td", recursive=False)
        if len(cells) != 4:
            raise ValueError("Malformed session row")
        day, hours, kind, location = map(clean, cells)
        try:
            date = datetime.strptime(day, "%d.%m.%Y").date()
        except ValueError as exc:
            raise ValueError(f"Invalid session date {day}") from exc
        times = re.fullmatch(r"(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})", hours)
        cancelled = any(word in (hours + kind).lower() for word in ("cancel", "annul", "abgesagt"))
        if not times:
            meetings.append(
                Meeting(
                    unresolved=True,
                    cancelled=cancelled,
                    location=location,
                    note=f"{day} {hours} {kind}",
                )
            )
            continue
        starts = datetime.combine(date, datetime.strptime(times[1], "%H:%M").time(), ZURICH)
        ends = datetime.combine(date, datetime.strptime(times[2], "%H:%M").time(), ZURICH)
        if ends <= starts:
            raise ValueError("Invalid session time interval")
        meetings.append(
            Meeting(
                starts_at=starts, ends_at=ends, location=location, cancelled=cancelled, note=kind
            )
        )
    if not meetings:
        meetings.append(Meeting(unresolved=True, note="Meeting times unpublished"))
    assignments = []
    for cell in main.select('[data-accordion-content="tab-4"] tbody tr > td'):
        version = clean(cell.select_one("small"))
        assignments.append(
            ProgrammeAssignment(
                programme=clean(cell.select_one("strong")),
                version=version.removeprefix("Version: "),
                paths=tuple(clean(tag) for tag in cell.select("div.box")),
            )
        )
    link = main.select_one('a[href*="calendar.html"]')
    return Offering(
        source_id=entry.source_id,
        course=Course(code=entry.code, titles=titles),
        terms=entry.terms,
        ects=float(ects_match[1].replace(",", ".")) if ects_match else None,
        languages=language_codes(entry.languages),
        levels=tuple(
            value.strip() for value in fields.get("Level", "").split(",") if value.strip()
        ),
        lecturer=fields.get("Teachers", entry.lecturer),
        faculty_domain=entry.faculty_domain,
        schedule_summary=entry.schedule_summary,
        recurrence_summary=fields.get("Summary schedule", ""),
        meetings=tuple(meetings),
        assessment=clean(main.select_one('[data-accordion-content="tab-3"]')),
        prerequisites=fields.get("Conditions of access", fields.get("Prerequisites", "")),
        equivalents=fields.get("Equivalent courses", fields.get("Equivalences", "")),
        assignments=tuple(assignments),
        calendar_url=urljoin(BASE, str(link["href"])) if link else None,
        listing_fingerprint=entry.fingerprint,
        detail_hash=digest(raw),
    )


def parse_calendar(raw: str) -> tuple[Meeting, ...]:
    calendar = Calendar.from_ical(raw.strip())
    if calendar.name != "VCALENDAR":
        raise ValueError("Invalid calendar")
    meetings = []
    for event in calendar.walk("VEVENT"):
        start_prop, end_prop = event.get("DTSTART"), event.get("DTEND")
        start, end = getattr(start_prop, "dt", None), getattr(end_prop, "dt", None)
        resolved = isinstance(start, datetime) and isinstance(end, datetime)
        if isinstance(start, datetime) and isinstance(end, datetime):
            start = (
                start.replace(tzinfo=ZURICH) if start.tzinfo is None else start.astimezone(ZURICH)
            )
            end = end.replace(tzinfo=ZURICH) if end.tzinfo is None else end.astimezone(ZURICH)
            if end <= start:
                raise ValueError("Invalid calendar interval")

        def dates(key: str) -> tuple[str, ...]:
            props = event.get(key, [])
            props = props if isinstance(props, list) else [props]
            return tuple(item.dt.isoformat() for prop in props for item in prop.dts)

        recurrence = event.get("RRULE")
        rid = event.get("RECURRENCE-ID")
        meetings.append(
            Meeting(
                starts_at=start if resolved else None,
                ends_at=end if resolved else None,
                unresolved=not resolved,
                cancelled=str(event.get("STATUS", "")) == "CANCELLED",
                location=str(event.get("LOCATION", "")).strip(),
                source_uid=str(event.get("UID", "")),
                recurrence=recurrence.to_ical().decode() if recurrence else None,
                excluded_dates=dates("EXDATE"),
                additional_dates=dates("RDATE"),
                recurrence_id=rid.dt.isoformat() if rid else None,
                note="" if resolved else f"Unpublished time: {start}",
            )
        )
    return tuple(meetings)
