"""Studio API routes — delegates to backend abstraction layer.

Supports mock and Hermes backends. Frontend always talks to /studio/* endpoints.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from hermes_adapter.backend_base import StudioBackend
from hermes_adapter.security import require_token

router = APIRouter(prefix="/studio")

# Backend instance — initialized on first request
_backend: StudioBackend | None = None
_backend_status: dict[str, Any] = {}


async def _get_backend() -> StudioBackend:
    """Get or create the backend instance."""
    global _backend, _backend_status
    if _backend is None:
        from hermes_adapter.backend_factory import create_backend
        _backend, _backend_status = await create_backend()
    return _backend


def _sse(data: dict[str, Any]) -> str:
    event_type = data.get("type", "unknown")
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@router.get("/health")
async def health() -> dict[str, Any]:
    backend = await _get_backend()
    h = await backend.health()
    h["backend_status"] = _backend_status
    return h


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------


@router.get("/bootstrap")
async def bootstrap(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        data = await backend.bootstrap()
        data["backend_status"] = _backend_status
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": {"code": "bootstrap_error", "message": str(e)}})


# ---------------------------------------------------------------------------
# Profiles
# ---------------------------------------------------------------------------


@router.get("/profiles")
async def list_profiles(_token: None = Depends(require_token)) -> list[dict[str, Any]]:
    backend = await _get_backend()
    return await backend.list_profiles()


@router.get("/profiles/active")
async def get_active_profile(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    profile = await backend.get_active_profile()
    if profile:
        return profile
    return {"id": "unknown", "name": "unknown", "active": True}


@router.post("/profiles/activate")
async def activate_profile(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    profile_id = body.get("profile_id", "")
    result = await backend.activate_profile(profile_id)
    if result.get("status") == "not_implemented":
        raise HTTPException(status_code=501, detail={"error": {"code": "not_implemented", "message": result.get("message", "Profile switching not implemented")}})
    return result


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


@router.get("/sessions")
async def list_sessions(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    return await backend.list_sessions()


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.get_session(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "not_found", "message": f"Session '{session_id}' not found"}})


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


@router.post("/runs")
async def start_run(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    session_id = body.get("session_id", "default")
    prompt = body.get("prompt", "")
    profile = body.get("profile")
    result = await backend.start_run(session_id, prompt, profile)
    if result.get("status") == "failed":
        raise HTTPException(status_code=502, detail={"error": {"code": "run_failed", "message": result.get("error", "Run failed")}})
    return result


@router.get("/runs/{run_id}/events")
async def stream_run_events(run_id: str, _token: None = Depends(require_token)) -> StreamingResponse:
    backend = await _get_backend()

    async def event_generator() -> AsyncIterator[str]:
        async for event in backend.stream_run_events(run_id):
            yield _sse(event)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/runs/{run_id}/stop")
async def stop_run(run_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    return await backend.stop_run(run_id)


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------


@router.get("/logs")
async def get_logs(
    source: str | None = Query(None, description="Log file name"),
    tail: int = Query(100, description="Number of recent lines"),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    return await backend.get_logs(source=source, tail=tail)


@router.get("/logs/stream")
async def stream_logs(
    source: str | None = Query(None, description="Log file name to stream"),
    _token: None = Depends(require_token),
) -> StreamingResponse:
    backend = await _get_backend()

    async def log_generator() -> AsyncIterator[str]:
        async for event in backend.stream_logs(source=source):
            yield _sse(event)

    return StreamingResponse(log_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Themes
# ---------------------------------------------------------------------------


@router.get("/themes")
async def list_themes(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    return await backend.list_themes()


@router.post("/themes/activate")
async def activate_theme(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    theme_id = body.get("theme_id", "")
    try:
        return await backend.activate_theme(theme_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "not_found", "message": f"Theme '{theme_id}' not found"}})


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@router.get("/config")
async def get_config(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    return await backend.get_config()


@router.patch("/config")
async def patch_config(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    key = body.get("key")
    value = body.get("value")
    if not key:
        raise HTTPException(status_code=400, detail={"error": {"code": "invalid_request", "message": "key is required"}})
    try:
        return await backend.patch_config(key, value)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "config_error", "message": str(e)}})
