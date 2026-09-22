from urllib.parse import parse_qs

import pytest
from unifr_ingest.http import HttpCatalogueSource, Response
from test_http import Cache, Clock
from test_parsers import fixture


def test_dynamic_semester_selector_and_scoped_post_retry():
    requests = []
    clock = Clock()

    def transport(request):
        requests.append(request)
        if request.data is None:
            return Response(
                status=200,
                body="""<select name="semestres" id="semestres">
              <option value="">All</option><option value="901">AS-2024</option>
              <option value="905">SS-2027</option></select>""",
            )
        return Response(
            status=200,
            body=("<p>Still loading...</p>" if len(requests) == 2 else fixture("listing.html")),
        )

    source = HttpCatalogueSource(Cache(), transport=transport, clock=clock.now, sleep=clock.sleep)
    assert source.semesters() == {"AS-2024": "901", "SS-2027": "905"}
    assert source.listing(1, semester="901").reported_count == 3658
    assert parse_qs(requests[-1].data.decode())["semestres"] == ["901"]
    source.listing(1)
    assert parse_qs(requests[-1].data.decode(), keep_blank_values=True)["semestres"] == [""]
    assert clock.time >= 1.5


@pytest.mark.parametrize(
    "html",
    [
        "<p>Still loading...</p>",
        '<select name="semestres"></select>',
        '<select name="semestres"><option value="1">AS-2024</option><option value="2">AS-2024</option></select>',
    ],
)
def test_unknown_semesters_are_not_empty_coverage(html):
    clock = Clock()
    source = HttpCatalogueSource(
        Cache(),
        transport=lambda _: Response(status=200, body=html),
        clock=clock.now,
        sleep=clock.sleep,
    )
    with pytest.raises(ValueError):
        source.semesters()
