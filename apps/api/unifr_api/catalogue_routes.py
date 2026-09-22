"""Public read HTTP boundary; ingestion and student choices have no write route."""

from collections.abc import Iterator
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import Engine, create_engine
from sqlalchemy.exc import SQLAlchemyError

from .catalogue_read import (
    CatalogueFilters,
    CatalogueDiscovery,
    CatalogueReadService,
    CatalogueStatus,
    CatalogueTerms,
    CourseDetail,
    CoursePage,
)
from .config import Settings
from .catalogue_history import historical_reader, historical_terms

router = APIRouter(prefix="/api/v1")


class CatalogueError(BaseModel):
    detail: str


@lru_cache(maxsize=8)
def catalogue_engine(url: str) -> Engine:
    # SQLAlchemy engines/pools are thread safe. Each reader pins its own generation.
    return create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 3} if url.startswith("postgresql") else {},
    )


def reader(request: Request) -> Iterator[CatalogueReadService | None]:
    try:
        service = CatalogueReadService(catalogue_engine(Settings().database_url))
        if request.query_params.get("scope") == "history" and "/catalogue/" in request.url.path:
            service = historical_reader(service, request.query_params.get("term"))
    except SQLAlchemyError:
        service = None
    yield service


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


@router.get(
    "/catalogue/courses",
    operation_id="catalogueCourses",
    responses={503: {"model": CatalogueError, "description": "Catalogue unavailable"}},
)
def courses(service: Reader, filters: Annotated[CatalogueFilters, Query()]) -> CoursePage:
    return available(service).course_list(filters)


@router.get(
    "/catalogue/courses/{course_code}",
    operation_id="catalogueCourse",
    responses={
        503: {"model": CatalogueError, "description": "Catalogue unavailable"},
        404: {"model": CatalogueError, "description": "Course not found"},
    },
)
def course(
    course_code: str,
    service: Reader,
    scope: Literal["current", "history"] = "current",
    term: str | None = None,
) -> CourseDetail:
    found = available(service).course(course_code)
    if found is None:
        raise HTTPException(status_code=404, detail="Course not found in published catalogue")
    return found


@router.get(
    "/catalogue/terms",
    operation_id="catalogueTerms",
    responses={503: {"model": CatalogueError, "description": "Catalogue unavailable"}},
)
def terms(service: Reader, scope: Literal["current", "history"] = "current") -> CatalogueTerms:
    if scope == "history":
        if service is None:
            raise HTTPException(status_code=503, detail="Catalogue database unavailable")
        return historical_terms(service)
    return available(service).terms()


@router.get(
    "/catalogue/discovery",
    operation_id="catalogueDiscovery",
    responses={503: {"model": CatalogueError, "description": "Catalogue unavailable"}},
)
def discovery(service: Reader, filters: Annotated[CatalogueFilters, Query()]) -> CatalogueDiscovery:
    if not filters.term:
        raise HTTPException(status_code=422, detail="Discovery requires a term")
    return available(service).discovery(filters)
