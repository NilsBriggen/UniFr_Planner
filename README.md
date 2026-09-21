# UniFr_Planner

Development setup is documented in [`docs/development.md`](docs/development.md). The recoverable,
observable self-hosted release procedure is in [`docs/operations.md`](docs/operations.md); populate
the variables from [`deploy/production.env.example`](deploy/production.env.example) in a protected
file outside the repository.

Programme configuration and the semester review workflow are documented in
[`docs/programme-recipes.md`](docs/programme-recipes.md).

## Scraping

The timetable is server-rendered HTML, so you can fetch each page with `requests` and parse the course cards with BeautifulSoup. The visible page currently has 44 pages, but `jour=2` filters to Monday—omit it for the unfiltered index.

```bash
pip install requests beautifulsoup4
```

```python
import re
import time
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.unifr.ch/timetable/de/"

session = requests.Session()
session.headers.update({
    "User-Agent": "course-index-research/0.1"
})


def parse_page(html):
    soup = BeautifulSoup(html, "html.parser")
    courses = []

    for article in soup.select("main article.agenda--teaser"):
        heading = article.select_one("h4")
        if not heading:
            continue

        small = heading.select_one("small")
        meta = small.get_text(" ", strip=True) if small else ""

        title = heading.get_text(" ", strip=True)
        if meta:
            title = title.replace(meta, "", 1).strip()

        fields = [
            span.get_text(" ", strip=True)
            for span in article.select("p span")
        ]

        courses.append({
            "meta": meta,
            "title": title,
            "schedule": [
                x.get_text(" ", strip=True)
                for x in article.select("span.calendar_span")
            ],
            "lecturer": fields[1] if len(fields) > 1 else None,
            "faculty_area": fields[2] if len(fields) > 2 else None,
            "language": fields[3] if len(fields) > 3 else None,
        })

    return courses


all_courses = []

for page in range(1, 100):
    response = session.get(
        BASE_URL,
        params={"page": page},       # deliberately no "jour=2"
        timeout=30,
    )
    response.raise_for_status()

    page_courses = parse_page(response.text)

    if not page_courses:
        break

    print(f"Page {page}: {len(page_courses)} courses")
    all_courses.extend(page_courses)

    time.sleep(0.5)  # be polite to the server

print(f"Total courses: {len(all_courses)}")
print(all_courses[:2])
```

A course will look approximately like:

```python
{
    "meta": "MASTER | FS-2027 | UE-SCH.04144",
    "title": "Advanced organic chemistry I (lectures)",
    "schedule": [
        "Montag 08:15 - 10:00 PER 10, Raum 313"
    ],
    "lecturer": "Bochet Christian",
    "faculty_area": "Math.-Nat. und Med. Fakultät, Chemie",
    "language": "Englisch"
}
```

The pagination links themselves are JavaScript hash links such as `#page-2`; the actual requests use the query parameter `page=2`.

For a first diagnostic, print the result count for these variants:

```python
for params in ({}, {"page": 1}, {"jour": 2, "page": 1}):
    r = session.get(BASE_URL, params=params)
    soup = BeautifulSoup(r.text, "html.parser")
    print(params, soup.select_one("main").get_text(" ", strip=True)[:100])
```

If the unfiltered request behaves unexpectedly, inspect the browser’s Network panel while clicking “Suchen”; the JavaScript may add filter parameters such as semester, language, or faculty.
