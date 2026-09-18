from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from sqlalchemy.exc import SQLAlchemyError

from unifr_api.database import check_database
from unifr_api.catalogue_routes import router as catalogue_router
from unifr_api.account_routes import router as account_router
from unifr_api.account_security import AccountError
from unifr_api.config import Settings


class AccountBoundary:
    """Fail closed on origins; cap even chunked bodies before JSON parsing."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/api/v1/account"):
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])

        async def private_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [
                    *message["headers"],
                    (b"cache-control", b"no-store"),
                    (b"pragma", b"no-cache"),
                    (b"x-content-type-options", b"nosniff"),
                ]
            await send(message)

        if scope["method"] not in ("GET", "HEAD"):
            origin = headers.get(b"origin", b"").decode("latin1")
            if (
                origin not in Settings().account_origins
                or headers.get(b"sec-fetch-site") == b"cross-site"
            ):
                await JSONResponse({"detail": "Origin not allowed"}, status_code=403)(
                    scope, receive, private_send
                )
                return
        maximum = 20_000_000 if "/plans" in scope["path"] else 4096
        body = bytearray()
        while True:
            part = await receive()
            if part["type"] == "http.disconnect":
                return
            body.extend(part.get("body", b""))
            if len(body) > maximum:
                await JSONResponse({"detail": "Request too large"}, status_code=413)(
                    scope, receive, private_send
                )
                return
            if not part.get("more_body", False):
                break
        consumed = False

        async def bounded_receive() -> Message:
            nonlocal consumed
            if not consumed:
                consumed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, private_send)


app = FastAPI(title="UniFr Planner API", version="0.1.0")
app.include_router(catalogue_router)
app.include_router(account_router)
app.add_middleware(AccountBoundary)


@app.exception_handler(AccountError)
async def account_error(request: Request, error: AccountError) -> JSONResponse:
    return JSONResponse(
        {"detail": error.detail},
        status_code=error.status,
        headers={"Retry-After": "900"} if error.status == 429 else None,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError) -> Response:
    if request.url.path.startswith("/api/v1/account"):
        # FastAPI's default validation response echoes input, including passwords.
        return JSONResponse({"detail": "Invalid input"}, status_code=422)
    from fastapi.exception_handlers import request_validation_exception_handler

    return await request_validation_exception_handler(request, error)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness only; database readiness is reported independently."""
    return {"status": "ok", "service": "unifr-planner"}


@app.get("/api/ready")
def ready() -> dict[str, str]:
    try:
        check_database()
    except SQLAlchemyError as error:
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    return {"status": "ready"}
