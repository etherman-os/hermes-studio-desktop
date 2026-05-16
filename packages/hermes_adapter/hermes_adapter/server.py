"""FastAPI server for the Hermes Desktop Studio adapter."""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

import uvicorn
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from hermes_adapter.events import is_terminal_event, normalize_hermes_event
from hermes_adapter.hermes_api import HermesClient
from hermes_adapter.htg_routes import router as htg_router
from hermes_adapter.models import (
    BootstrapResponse,
    ConfigView,
    ErrorDetail,
    ErrorResponse,
    ProfileInfo,
    RunRequest,
    RunResponse,
    SessionSummary,
    ShellEvent,
    ThemeActivateRequest,
    ThemeInfo,
)
from hermes_adapter.security import generate_token, require_token, set_auth_token, write_token
from hermes_adapter.studio_routes import router as studio_router
from hermes_adapter.studio_storage import get_studio_storage_status
from hermes_adapter.themes import ThemeManager

_theme_manager = ThemeManager()
_client: HermesClient | None = None

__all__ = ["app", "create_app", "set_auth_token"]

legacy_router = APIRouter(prefix="/shell")


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: write token on startup, cleanup on shutdown."""
    global _client
    token = (
        os.environ.get("HERMES_STUDIO_ADAPTER_TOKEN")
        or os.environ.get("HERMES_STUDIO_TOKEN")
        or generate_token()
    )
    set_auth_token(token)
    write_token(token)
    _client = HermesClient()
    yield
    # Close backend (HermesBackend httpx.AsyncClient) before shutting down.
    from hermes_adapter.studio_routes import close_backend
    await close_backend()
    if _client is not None:
        await _client.close()
    _client = None


async def health_root() -> dict[str, Any]:
    """Root-level health check (no auth required)."""
    from hermes_adapter.studio_routes import _backend_status, _get_backend
    storage = get_studio_storage_status()
    try:
        backend = await _get_backend()
        h = await backend.health()
        h["backend_status"] = _backend_status
        h["storage"] = storage
        return h
    except Exception:
        return {
            "status": "healthy",
            "adapter_version": "0.1.0",
            "hermes_connected": False,
            "uptime_seconds": 0,
            "backend_mode": "unknown",
            "storage": storage,
        }


def _get_client() -> HermesClient:
    """Return the global HermesClient instance, creating lazily if needed."""
    global _client
    if _client is None:
        _client = HermesClient()
    return _client


@legacy_router.get("/bootstrap", response_model=BootstrapResponse)
async def bootstrap(
    _token: None = Depends(require_token),
) -> BootstrapResponse:
    """Return bootstrap payload for the UI."""
    client = _get_client()
    health = await client.health_check()
    capabilities = await client.get_capabilities()
    active_theme = _theme_manager.get_active_theme()

    return BootstrapResponse(
        adapter_version="0.1.0",
        hermes_version=health.get("version", "unknown"),
        active_profile="default",
        capabilities=capabilities,
        recent_sessions=_mock_sessions(),
        active_theme=active_theme,
    )


@legacy_router.get("/profiles", response_model=list[ProfileInfo])
async def list_profiles(
    _token: None = Depends(require_token),
) -> list[ProfileInfo]:
    """Return available Hermes profiles."""
    return [
        ProfileInfo(name="default", path="~/.hermes/profiles/default"),
        ProfileInfo(name="coding", path="~/.hermes/profiles/coding"),
    ]


@legacy_router.get("/sessions", response_model=list[SessionSummary])
async def list_sessions(
    _token: None = Depends(require_token),
) -> list[SessionSummary]:
    """Return recent sessions."""
    return _mock_sessions()


@legacy_router.get("/sessions/{session_id}", response_model=SessionSummary)
async def get_session(
    session_id: str,
    _token: None = Depends(require_token),
) -> SessionSummary:
    """Return a single session summary by ID."""
    for session in _mock_sessions():
        if session.id == session_id:
            return session
    raise _not_found("session", session_id)


@legacy_router.post("/runs", response_model=RunResponse)
async def create_run(
    request: RunRequest,
    _token: None = Depends(require_token),
) -> RunResponse:
    """Start a new run."""
    client = _get_client()
    return await client.start_run(request)


@legacy_router.get("/runs/{run_id}/events")
async def stream_run_events(
    run_id: str,
    _token: None = Depends(require_token),
) -> StreamingResponse:
    """Stream normalized Hermes events as SSE."""
    client = _get_client()

    async def event_generator() -> AsyncIterator[str]:
        async for raw in client.stream_events(run_id):
            event = normalize_hermes_event(raw)
            yield _format_sse(event)
            if is_terminal_event(event):
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )


@legacy_router.post("/runs/{run_id}/stop")
async def stop_run(
    run_id: str,
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    """Stop an active run."""
    client = _get_client()
    return await client.stop_run(run_id)


@legacy_router.get("/logs/stream")
async def stream_logs(
    _token: None = Depends(require_token),
) -> StreamingResponse:
    """Stream mock log lines as SSE."""

    async def log_generator() -> AsyncIterator[str]:
        for i in range(10):
            event = ShellEvent(
                type="log.line",
                payload={"level": "info", "message": f"Mock log line {i + 1}"},
            )
            yield _format_sse(event)
            await asyncio.sleep(0.5)

    return StreamingResponse(
        log_generator(),
        media_type="text/event-stream",
    )


@legacy_router.get("/config", response_model=ConfigView)
async def get_config(
    _token: None = Depends(require_token),
) -> ConfigView:
    """Return current adapter configuration."""
    return ConfigView(
        config={
            "theme_dir": str(_theme_manager.themes_dir),
            "hermes_base_url": "http://127.0.0.1:39190",
            "auto_save": True,
        }
    )


@legacy_router.patch("/config", response_model=ConfigView)
async def patch_config(
    updates: ConfigView,
    _token: None = Depends(require_token),
) -> ConfigView:
    """Safely update adapter configuration."""
    # For MVP, just echo back the provided config.
    return updates


@legacy_router.get("/themes", response_model=list[ThemeInfo])
async def list_themes(
    _token: None = Depends(require_token),
) -> list[ThemeInfo]:
    """Return all installed themes."""
    return _theme_manager.list_themes()


@legacy_router.post("/themes/activate")
async def activate_theme(
    body: ThemeActivateRequest,
    _token: None = Depends(require_token),
) -> ThemeInfo:
    """Activate a theme by ID."""
    return _theme_manager.set_active_theme(body.theme_id)


def _format_sse(event: ShellEvent | dict[str, Any]) -> str:
    """Format a ShellEvent as an SSE message string."""
    if isinstance(event, ShellEvent):
        return f"event: {event.type}\ndata: {event.model_dump_json()}\n\n"
    return f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"


def _mock_sessions() -> list[SessionSummary]:
    """Return mock session data for MVP."""
    now = datetime.now(UTC)
    return [
        SessionSummary(
            id="sess-001",
            title="General Chat",
            created_at=now,
            updated_at=now,
            message_count=12,
        ),
        SessionSummary(
            id="sess-002",
            title="Code Review",
            created_at=now,
            updated_at=now,
            message_count=5,
        ),
    ]


def _not_found(resource: str, identifier: str) -> HTTPException:
    """Return a 404 exception wrapped in an ErrorResponse shape."""
    return HTTPException(
        status_code=404,
        detail=ErrorResponse(
            error=ErrorDetail(
                code="not_found",
                message=f"{resource} '{identifier}' not found",
                retryable=False,
                source="adapter",
                hint="Check the identifier and try again",
            )
        ).model_dump(),
    )


def _legacy_shell_routes_enabled() -> bool:
    """Return whether legacy prototype /shell routes should be mounted."""
    return os.environ.get("HERMES_STUDIO_ENABLE_LEGACY_SHELL_ROUTES") == "1"


def _normalize_error_detail(detail: Any, status_code: int) -> dict[str, Any]:
    """Normalize FastAPI HTTPException detail into the Studio error envelope."""
    if isinstance(detail, dict) and isinstance(detail.get("error"), dict):
        error = dict(detail["error"])
    else:
        message = detail if isinstance(detail, str) else f"HTTP {status_code}"
        error = {
            "code": f"http_{status_code}",
            "message": str(message),
            "retryable": False,
            "source": "adapter",
            "hint": None,
        }

    error.setdefault("code", f"http_{status_code}")
    error.setdefault("message", f"HTTP {status_code}")
    error.setdefault("retryable", False)
    error.setdefault("source", "adapter")
    error.setdefault("hint", None)
    return {"error": error}


async def _http_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Return a consistent Studio error envelope for HTTP exceptions."""
    if not isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=500,
            content=_normalize_error_detail(str(exc), 500),
        )
    return JSONResponse(
        status_code=exc.status_code,
        content=_normalize_error_detail(exc.detail, exc.status_code),
        headers=exc.headers,
    )


async def _validation_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Return Studio error envelope for request validation failures."""
    message = "Invalid request"
    if isinstance(exc, RequestValidationError) and exc.errors():
        message = str(exc.errors()[0].get("msg", message))
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_request",
                "message": message,
                "retryable": False,
                "source": "adapter",
                "hint": "Check the request body and parameters.",
            }
        },
    )


def create_app(enable_legacy_shell_routes: bool | None = None) -> FastAPI:
    """Create the FastAPI app with Studio routes and optional legacy shell routes."""
    application = FastAPI(
        title="Hermes Desktop Studio Adapter",
        version="0.1.0",
        lifespan=_lifespan,
    )

    # CORS middleware for Tauri dev server
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:1420", "http://127.0.0.1:1420", "tauri://localhost"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.add_exception_handler(HTTPException, _http_exception_handler)
    application.add_exception_handler(RequestValidationError, _validation_exception_handler)
    application.include_router(studio_router)
    application.include_router(htg_router)
    application.get("/health")(health_root)

    legacy_enabled = (
        _legacy_shell_routes_enabled()
        if enable_legacy_shell_routes is None
        else enable_legacy_shell_routes
    )
    if legacy_enabled:
        application.include_router(legacy_router)

    return application


app = create_app()


def main() -> None:
    """Run the uvicorn server on 127.0.0.1:39191."""
    uvicorn.run(
        "hermes_adapter.server:app",
        host="127.0.0.1",
        port=39191,
        log_level="info",
    )


if __name__ == "__main__":
    main()
