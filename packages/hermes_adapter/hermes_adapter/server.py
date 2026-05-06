"""FastAPI server for the Hermes Local Shell adapter."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

from hermes_adapter.events import is_terminal_event, normalize_hermes_event
from hermes_adapter.hermes_api import HermesClient
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
from hermes_adapter.themes import ThemeManager

_theme_manager = ThemeManager()
_client: HermesClient | None = None


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: write token on startup, cleanup on shutdown."""
    global _client
    token = generate_token()
    write_token(token)
    _client = HermesClient()
    yield
    if _client is not None:
        await _client.close()
    _client = None


app = FastAPI(
    title="Hermes Local Shell Adapter",
    version="0.1.0",
    lifespan=_lifespan,
)

# Mount studio routes (Phase 3: fake adapter for desktop studio)
app.include_router(studio_router)


@app.get("/health")
async def health_root() -> dict[str, Any]:
    """Root-level health check (no auth required)."""
    return {
        "status": "healthy",
        "adapter_version": "0.1.0",
        "hermes_connected": False,
        "uptime_seconds": 0,
    }


def _get_client() -> HermesClient:
    """Return the global HermesClient instance, creating lazily if needed."""
    global _client
    if _client is None:
        _client = HermesClient()
    return _client


@app.get("/shell/bootstrap", response_model=BootstrapResponse)
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


@app.get("/shell/profiles", response_model=list[ProfileInfo])
async def list_profiles(
    _token: None = Depends(require_token),
) -> list[ProfileInfo]:
    """Return available Hermes profiles."""
    return [
        ProfileInfo(name="default", path="~/.hermes/profiles/default"),
        ProfileInfo(name="coding", path="~/.hermes/profiles/coding"),
    ]


@app.get("/shell/sessions", response_model=list[SessionSummary])
async def list_sessions(
    _token: None = Depends(require_token),
) -> list[SessionSummary]:
    """Return recent sessions."""
    return _mock_sessions()


@app.get("/shell/sessions/{session_id}", response_model=SessionSummary)
async def get_session(
    session_id: str,
    _token: None = Depends(require_token),
) -> SessionSummary:
    """Return a single session summary by ID."""
    for session in _mock_sessions():
        if session.id == session_id:
            return session
    raise _not_found("session", session_id)


@app.post("/shell/runs", response_model=RunResponse)
async def create_run(
    request: RunRequest,
    _token: None = Depends(require_token),
) -> RunResponse:
    """Start a new run."""
    client = _get_client()
    return await client.start_run(request)


@app.get("/shell/runs/{run_id}/events")
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


@app.post("/shell/runs/{run_id}/stop")
async def stop_run(
    run_id: str,
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    """Stop an active run."""
    client = _get_client()
    return await client.stop_run(run_id)


@app.get("/shell/logs/stream")
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


@app.get("/shell/config", response_model=ConfigView)
async def get_config(
    _token: None = Depends(require_token),
) -> ConfigView:
    """Return current adapter configuration."""
    return ConfigView(
        config={
            "theme_dir": str(_theme_manager._themes_dir),
            "hermes_base_url": "http://127.0.0.1:39190",
            "auto_save": True,
        }
    )


@app.patch("/shell/config", response_model=ConfigView)
async def patch_config(
    updates: ConfigView,
    _token: None = Depends(require_token),
) -> ConfigView:
    """Safely update adapter configuration."""
    # For MVP, just echo back the provided config.
    return updates


@app.get("/shell/themes", response_model=list[ThemeInfo])
async def list_themes(
    _token: None = Depends(require_token),
) -> list[ThemeInfo]:
    """Return all installed themes."""
    return _theme_manager.list_themes()


@app.post("/shell/themes/activate")
async def activate_theme(
    body: ThemeActivateRequest,
    _token: None = Depends(require_token),
) -> ThemeInfo:
    """Activate a theme by ID."""
    return _theme_manager.set_active_theme(body.theme_id)


def _format_sse(event: ShellEvent) -> str:
    """Format a ShellEvent as an SSE message string."""
    return f"event: {event.type}\ndata: {event.model_dump_json()}\n\n"


def _mock_sessions() -> list[SessionSummary]:
    """Return mock session data for MVP."""
    now = datetime.now(timezone.utc)
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
