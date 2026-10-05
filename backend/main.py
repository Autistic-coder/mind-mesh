"""MindMesh API entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .auth import router as auth_router
from .config import get_settings
from .ml_api import router as ml_router
from .ml_service import recover_interrupted_runs
from .workspace import router as workspace_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    recover_interrupted_runs()
    yield


app = FastAPI(title="MindMesh API", docs_url=None, redoc_url=None, lifespan=lifespan)
app.include_router(auth_router)
app.include_router(workspace_router)
app.include_router(ml_router)


@app.middleware("http")
async def browser_security(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method not in {
        "GET",
        "HEAD",
        "OPTIONS",
    }:
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") != get_settings().origin:
            return JSONResponse(
                {"detail": "Request origin is not allowed."},
                status_code=403,
                headers={"Cache-Control": "no-store"},
            )
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, private"
        response.headers["Vary"] = "Cookie"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, error: RequestValidationError):
    # Pydantic's default response includes the submitted value. Never echo passwords.
    issues = [
        {"loc": item["loc"], "msg": item["msg"], "type": item["type"]} for item in error.errors()
    ]
    return JSONResponse({"detail": issues}, status_code=422, headers={"Cache-Control": "no-store"})


@app.get("/api/health")
def health():
    return {"status": "ok"}
