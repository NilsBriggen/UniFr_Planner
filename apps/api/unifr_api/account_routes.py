"""HTTP boundary only; secrets never appear in query strings, errors, or logs."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.security import APIKeyCookie
from sqlalchemy import create_engine

from .account_models import (
    AccountArchive,
    Created,
    Credentials,
    GuestImport,
    Identity,
    Password,
    PrivateError,
    PlanList,
    PlanWrite,
    Recovery,
    RecoverySnapshot,
    WriteResult,
)
from .account_repository import AccountRepository
from .account_security import SESSION_SECONDS
from .config import Settings

COOKIE = "__Host-unifr_session"
router = APIRouter(
    prefix="/api/v1/account",
    tags=["account"],
    responses={code: {"model": PrivateError} for code in (400, 401, 403, 404, 409, 413, 422, 429)},
)
cookie_auth = APIKeyCookie(name=COOKIE, scheme_name="PrivateSession", auto_error=False)
private = [Depends(cookie_auth)]


def repository(
    request: Request,
    expected_owner: Annotated[str | None, Header(alias="X-Unifr-Account")] = None,
) -> Iterator[AccountRepository]:
    # These explicit credential operations deliberately select a new account;
    # the precondition protects actions on an already displayed private account.
    if request.url.path in {
        "/api/v1/account/register",
        "/api/v1/account/login",
        "/api/v1/account/recover",
    }:
        expected_owner = None
    engine = create_engine(Settings().database_url)
    try:
        yield AccountRepository(engine, expected_owner=expected_owner)
    finally:
        engine.dispose()


Repo = Annotated[AccountRepository, Depends(repository)]


def secret(request: Request) -> str | None:
    return request.cookies.get(COOKIE)


def session_cookie(response: Response, value: str) -> None:
    response.set_cookie(
        COOKIE,
        value,
        secure=True,
        httponly=True,
        samesite="strict",
        path="/",
        max_age=SESSION_SECONDS,
    )


def clear_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE, path="/", secure=True, httponly=True, samesite="strict")


def limit(repo: AccountRepository, request: Request, username: str) -> None:
    # Do not trust attacker-controlled X-Forwarded-For. Configure trusted proxies
    # in the ASGI server if per-client limits are required behind a reverse proxy.
    repo.rate_limit(request.client.host if request.client else "unknown", username)


@router.post("/register", response_model=Created, status_code=201)
def register(body: Credentials, request: Request, response: Response, repo: Repo) -> Created:
    limit(repo, request, body.username)
    value, recovery = repo.register(body.username, body.password.get_secret_value())
    repo.logout(secret(request))
    session_cookie(response, value)
    return Created(**repo.account_identity(value).model_dump(), recoveryCode=recovery)


@router.post("/login", response_model=Identity)
def login(body: Credentials, request: Request, response: Response, repo: Repo) -> Identity:
    limit(repo, request, body.username)
    value = repo.login(body.username, body.password.get_secret_value(), secret(request))
    session_cookie(response, value)
    return repo.account_identity(value)


@router.post("/recover", response_model=Created)
def recover(body: Recovery, request: Request, response: Response, repo: Repo) -> Created:
    limit(repo, request, body.username)
    value, replacement = repo.recover(
        body.username, body.recoveryCode.get_secret_value(), body.password.get_secret_value()
    )
    session_cookie(response, value)
    return Created(**repo.account_identity(value).model_dump(), recoveryCode=replacement)


@router.get("/session", response_model=Identity, dependencies=private)
def identity(request: Request, repo: Repo) -> Identity:
    return repo.account_identity(secret(request))


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, repo: Repo) -> None:
    repo.logout(secret(request))
    clear_cookie(response)


@router.get("/plans", response_model=PlanList, dependencies=private)
def list_plans(request: Request, repo: Repo) -> PlanList:
    return repo.plan_listing(secret(request))


@router.post("/plans/import", response_model=PlanList, status_code=201, dependencies=private)
def import_plans(body: GuestImport, request: Request, repo: Repo) -> PlanList:
    return PlanList(plans=repo.import_plans(secret(request), body.plans))


@router.put(
    "/plans/{identifier}",
    response_model=WriteResult,
    responses={409: {"model": WriteResult | PrivateError}},
    dependencies=private,
)
def write_plan(
    identifier: str, body: PlanWrite, request: Request, response: Response, repo: Repo
) -> WriteResult:
    result = repo.write_plan(secret(request), identifier, body.revision, body.snapshot)
    if result.conflict:
        response.status_code = 409
    return result


@router.get("/export", response_model=AccountArchive, dependencies=private)
def export(request: Request, response: Response, repo: Repo) -> AccountArchive:
    response.headers["Content-Disposition"] = 'attachment; filename="unifr-account-v1.json"'
    return repo.export(secret(request))


@router.get("/plans/{identifier}/recovery", response_model=RecoverySnapshot, dependencies=private)
def recover_snapshot(
    identifier: str, request: Request, response: Response, repo: Repo
) -> RecoverySnapshot:
    response.headers["Content-Disposition"] = 'attachment; filename="unifr-plan-recovery-v1.json"'
    return repo.recover_snapshot(secret(request), identifier)


@router.delete("", status_code=204, dependencies=private)
def delete_account(body: Password, request: Request, response: Response, repo: Repo) -> None:
    username = repo.identity(secret(request))
    limit(repo, request, username)
    repo.delete_account(secret(request), body.password.get_secret_value())
    clear_cookie(response)
