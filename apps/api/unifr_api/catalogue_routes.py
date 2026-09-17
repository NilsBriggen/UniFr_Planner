"""Public read HTTP boundary; ingestion and student choices have no write route."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

from .catalogue_read import (
    CatalogueFilters,
    CatalogueReadService,
    CatalogueStatus,
    CatalogueTerms,
    CourseDetail,
    CoursePage,
)
from .config import Settings

router = APIRouter(prefix="/api/v1")


def reader() -> Iterator[CatalogueReadService | None]:
    url = Settings().database_url
    engine = create_engine(
        url, connect_args={"connect_timeout": 3} if url.startswith("postgresql") else {}
    )
    try:
        try:
            service = CatalogueReadService(engine)
        except SQLAlchemyError:
            service = None
        yield service
    finally:
        engine.dispose()


def available(service: CatalogueReadService | None) -> CatalogueReadService:
    if service is None or service.status.availability != "available":
        raise HTTPException(
            status_code=503, detail="Catalogue unavailable; see /api/v1/status/catalogue"
        )
    return service


Reader = Annotated[CatalogueReadService | None, Depends(reader)]


@router.get("/status/catalogue", operation_id="catalogueStatus")
def status(service: Reader) -> CatalogueStatus:
    return service.status if service else CatalogueStatus(reason="database_unavailable")


@router.get("/catalogue/courses", operation_id="catalogueCourses")
def courses(service: Reader, filters: Annotated[CatalogueFilters, Query()]) -> CoursePage:
    return available(service).course_list(filters)


@router.get("/catalogue/courses/{course_code}", operation_id="catalogueCourse")
def course(course_code: str, service: Reader) -> CourseDetail:
    found = available(service).course(course_code)
    if found is None:
        raise HTTPException(status_code=404, detail="Course not found in published catalogue")
    return found


@router.get("/catalogue/terms", operation_id="catalogueTerms")
def terms(service: Reader) -> CatalogueTerms:
    return available(service).terms()
