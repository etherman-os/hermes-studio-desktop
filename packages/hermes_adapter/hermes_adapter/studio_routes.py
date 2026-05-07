"""Studio API routes — delegates to backend abstraction layer.

Supports mock and Hermes backends. Frontend always talks to /studio/* endpoints.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from hermes_adapter.approval_repository import ApprovalRepository
from hermes_adapter.backend_base import StudioBackend
from hermes_adapter.checkpoint_repository import CheckpointRepository
from hermes_adapter.context_repository import ContextRepository
from hermes_adapter.cron_repository import CronRepository
from hermes_adapter.delegation_repository import DelegationRepository
from hermes_adapter.process_manager import get_process_manager
from hermes_adapter.run_ledger_repository import RunLedgerRepository
from hermes_adapter.security import require_token
from hermes_adapter.studio_events import make_studio_event
from hermes_adapter.studio_storage import get_studio_storage_status
from hermes_adapter.tool_pack_repository import ToolPackRepository
from hermes_adapter.worktree_repository import WorktreeRepository

router = APIRouter(prefix="/studio")
logger = logging.getLogger(__name__)

# Backend instance — initialized on first request
_backend: StudioBackend | None = None
_backend_status: dict[str, Any] = {}
_backend_lock = asyncio.Lock()


async def _get_backend() -> StudioBackend:
    """Get or create the backend instance."""
    global _backend, _backend_status
    if _backend is None:
        async with _backend_lock:
            if _backend is None:
                from hermes_adapter.backend_factory import create_backend
                _backend, _backend_status = await create_backend()
    return _backend


def _sse(data: dict[str, Any]) -> str:
    event_type = data.get("type", "unknown")
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


def _error_detail(
    code: str,
    message: str,
    *,
    retryable: bool = False,
    source: str = "adapter",
    hint: str | None = None,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
            "source": source,
            "hint": hint,
        }
    }


def _backend_name() -> str:
    active = _backend_status.get("active_backend")
    mode = _backend_status.get("backend_mode")
    return str(active or mode or "unknown")


async def _model_name(backend: StudioBackend) -> str | None:
    try:
        model_config = await backend.get_model_config()
    except Exception:
        return None
    model = model_config.get("model")
    return str(model) if model else None


def _event_with_run_id(event: dict[str, Any], run_id: str) -> dict[str, Any]:
    if event.get("run_id"):
        return event
    return {**event, "run_id": run_id}


def _persist_started_run(
    *,
    run_id: str,
    session_id: str | None,
    status: str,
    prompt: str,
    backend: str,
    model: str | None,
    workspace_path: str | None,
) -> None:
    try:
        RunLedgerRepository().create_run(
            run_id=run_id,
            session_id=session_id,
            status=status,
            prompt=prompt,
            backend=backend,
            model=model,
            workspace_path=workspace_path,
        )
    except Exception as exc:
        logger.warning("Run ledger create failed for %s: %s", run_id, exc)


def _persist_run_event(run_id: str, event: dict[str, Any]) -> dict[str, Any] | None:
    try:
        RunLedgerRepository().append_event(run_id, event)
    except Exception as exc:
        logger.warning("Run ledger event persistence failed for %s: %s", run_id, exc)
        return make_studio_event(
            "adapter.warning",
            {
                "code": "run_ledger_persistence_unavailable",
                "message": "Run history is unavailable; live stream continues.",
            },
            source="adapter",
            run_id=run_id,
        )
    return None


def _persist_approval_event(event: dict[str, Any]) -> dict[str, Any] | None:
    event_type = event.get("type")
    if event_type not in {"approval.requested", "approval.resolved"}:
        return None
    try:
        repo = ApprovalRepository()
        if event_type == "approval.requested":
            repo.record_approval_requested(event)
        else:
            repo.record_approval_resolved(event)
    except Exception as exc:
        logger.warning("Approval persistence failed for %s: %s", event.get("id"), exc)
        return make_studio_event(
            "adapter.warning",
            {
                "code": "approval_persistence_unavailable",
                "message": "Approval history is unavailable; live stream continues.",
            },
            source="adapter",
            run_id=str(event.get("run_id")) if event.get("run_id") else None,
            session_id=str(event.get("session_id")) if event.get("session_id") else None,
        )
    return None


def _run_ledger_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 404 if "not found" in message.lower() else 503
    code = "not_found" if status_code == 404 else "run_ledger_unavailable"
    return HTTPException(
        status_code=status_code,
        detail=_error_detail(code, message, source="studio", retryable=status_code != 404),
    )


def _approval_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 404 if "not found" in message.lower() else 400
    code = "not_found" if status_code == 404 else "approval_error"
    return HTTPException(
        status_code=status_code,
        detail=_error_detail(code, message, source="studio"),
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@router.get("/health")
async def health() -> dict[str, Any]:
    backend = await _get_backend()
    h = await backend.health()
    h["backend_status"] = _backend_status
    h["storage"] = get_studio_storage_status()
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
        data["storage"] = get_studio_storage_status()
        return data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=_error_detail("bootstrap_error", str(e), retryable=True),
        ) from e


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
    return {"name": "unknown", "path": "", "active": True}


@router.post("/profiles/activate")
async def activate_profile(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    profile_id = body.get("profile_id", "")
    result = await backend.activate_profile(profile_id)
    if result.get("status") == "not_implemented":
        raise HTTPException(
            status_code=501,
            detail=_error_detail(
                "not_implemented",
                result.get("message", "Profile switching not implemented"),
                hint="Profile switching is intentionally disabled until a safe CLI-backed path is added.",
            ),
        )
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
    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=_error_detail("not_found", f"Session '{session_id}' not found"),
        ) from e


# ---------------------------------------------------------------------------
# Approvals
# ---------------------------------------------------------------------------


@router.get("/approvals")
async def list_approvals(
    status: str | None = Query(None, description="Approval status filter"),
    risk_level: str | None = Query(None, description="Risk level filter"),
    run_id: str | None = Query(None, description="Run id filter"),
    session_id: str | None = Query(None, description="Session id filter"),
    limit: int = Query(100, ge=1, le=250),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    try:
        return ApprovalRepository().list_approvals(
            status=status,
            risk_level=risk_level,
            run_id=run_id,
            session_id=session_id,
            limit=limit,
        )
    except (RuntimeError, ValueError) as e:
        raise _approval_http_error(e) from e


@router.get("/approvals/pending")
async def list_pending_approvals(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        return ApprovalRepository().list_pending_approvals()
    except (RuntimeError, ValueError) as e:
        raise _approval_http_error(e) from e


@router.get("/approvals/{approval_id}")
async def get_approval(approval_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        return ApprovalRepository().get_approval(approval_id)
    except (RuntimeError, ValueError) as e:
        raise _approval_http_error(e) from e


@router.post("/approvals/{approval_id}/approve")
async def approve_approval(approval_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        result = await backend.respond_to_approval(approval_id, "approved")
        # Emit SSE event for approval resolution
        try:
            from hermes_adapter.approval_repository import ApprovalRepository
            approval = ApprovalRepository().get_approval(approval_id)
            # Record the resolved event
            ApprovalRepository().record_approval_resolved({
                "type": "approval.resolved",
                "payload": {"approval_id": approval_id, "decision": "approved"},
                "run_id": approval.get("run_id"),
                "session_id": approval.get("session_id"),
            })
        except Exception:
            pass
        return result
    except ValueError as e:
        raise _approval_http_error(e) from e


@router.post("/approvals/{approval_id}/deny")
async def deny_approval(approval_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        result = await backend.respond_to_approval(approval_id, "denied")
        # Emit SSE event for approval resolution
        try:
            from hermes_adapter.approval_repository import ApprovalRepository
            approval = ApprovalRepository().get_approval(approval_id)
            ApprovalRepository().record_approval_resolved({
                "type": "approval.resolved",
                "payload": {"approval_id": approval_id, "decision": "denied"},
                "run_id": approval.get("run_id"),
                "session_id": approval.get("session_id"),
            })
        except Exception:
            pass
        return result
    except ValueError as e:
        raise _approval_http_error(e) from e


@router.get("/sessions/{session_id}/approvals")
async def list_session_approvals(session_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        return ApprovalRepository().list_approvals_for_session(session_id)
    except (RuntimeError, ValueError) as e:
        raise _approval_http_error(e) from e


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


@router.post("/runs")
async def start_run(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    session_id = body.get("session_id", "default")
    prompt = body.get("prompt", "")
    profile = body.get("profile")
    context = body.get("context", {})
    workspace_path = body.get("workspace_path")
    if not workspace_path and isinstance(context, dict):
        workspace_path = context.get("workspace_path")
    result = await backend.start_run(session_id, prompt, profile)
    if result.get("status") == "failed":
        raise HTTPException(
            status_code=502,
            detail=_error_detail(
                "run_failed",
                result.get("error", "Run failed"),
                retryable=True,
                source="hermes",
            ),
        )
    run_id = result.get("run_id")
    if run_id:
        _persist_started_run(
            run_id=str(run_id),
            session_id=str(session_id) if session_id else None,
            status=str(result.get("status", "started")),
            prompt=str(prompt),
            backend=_backend_name(),
            model=await _model_name(backend),
            workspace_path=str(workspace_path) if workspace_path else None,
        )
    return result


@router.get("/runs/recent")
async def get_recent_runs(
    limit: int = Query(50, ge=1, le=100),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.get_recent_runs(limit=limit)
    except (RuntimeError, ValueError) as e:
        raise _run_ledger_http_error(e) from e


@router.get("/runs/{run_id}")
async def get_run(run_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.get_run(run_id)
    except (RuntimeError, ValueError) as e:
        raise _run_ledger_http_error(e) from e


@router.get("/runs/{run_id}/ledger")
async def get_run_ledger(run_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.get_run_ledger(run_id)
    except (RuntimeError, ValueError) as e:
        raise _run_ledger_http_error(e) from e


@router.get("/runs/{run_id}/approvals")
async def list_run_approvals(run_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        return ApprovalRepository().list_approvals_for_run(run_id)
    except (RuntimeError, ValueError) as e:
        raise _approval_http_error(e) from e


@router.get("/runs/{run_id}/events")
async def stream_run_events(run_id: str, _token: None = Depends(require_token)) -> StreamingResponse:
    backend = await _get_backend()

    async def event_generator() -> AsyncIterator[str]:
        warned_about_run_persistence = False
        warned_about_approval_persistence = False
        async for event in backend.stream_run_events(run_id):
            enriched = _event_with_run_id(event, run_id)
            warning = _persist_run_event(run_id, enriched)
            approval_warning = _persist_approval_event(enriched)
            yield _sse(enriched)
            if warning and not warned_about_run_persistence:
                warned_about_run_persistence = True
                yield _sse(warning)
            if approval_warning and not warned_about_approval_persistence:
                warned_about_approval_persistence = True
                yield _sse(approval_warning)

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
# Model / Provider Config
# ---------------------------------------------------------------------------


@router.get("/model-config")
async def get_model_config(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    return await backend.get_model_config()


# ---------------------------------------------------------------------------
# Themes
# ---------------------------------------------------------------------------


@router.get("/themes")
async def list_themes(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    return await backend.list_themes()


@router.get("/themes/active")
async def get_active_theme(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    return await backend.get_active_theme()


@router.get("/themes/{theme_id}")
async def get_theme(theme_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.get_theme(theme_id)
    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=_error_detail("not_found", f"Theme '{theme_id}' not found"),
        ) from e


@router.post("/themes/activate")
async def activate_theme(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    theme_id = body.get("theme_id", "")
    try:
        return await backend.activate_theme(theme_id)
    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=_error_detail("not_found", f"Theme '{theme_id}' not found"),
        ) from e


@router.post("/themes/reload")
async def reload_themes(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    return await backend.reload_themes()


# ---------------------------------------------------------------------------
# Kanban
# ---------------------------------------------------------------------------


def _kanban_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 404 if "not found" in message.lower() else 400
    return HTTPException(
        status_code=status_code,
        detail=_error_detail("kanban_error", message, source="studio"),
    )


@router.get("/kanban/boards")
async def get_kanban_boards(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.get_kanban_boards()
    except (RuntimeError, ValueError) as e:
        raise _kanban_http_error(e) from e


@router.get("/kanban/boards/default")
async def get_default_kanban_board(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.get_default_kanban_board()
    except (RuntimeError, ValueError) as e:
        raise _kanban_http_error(e) from e


@router.get("/kanban/boards/{board_id}")
async def get_kanban_board(board_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.get_kanban_board(board_id)
    except (RuntimeError, ValueError) as e:
        raise _kanban_http_error(e) from e


@router.post("/kanban/cards")
async def create_kanban_card(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.create_kanban_card(body)
    except (RuntimeError, ValueError) as e:
        raise _kanban_http_error(e) from e


@router.patch("/kanban/cards/{card_id}")
async def update_kanban_card(
    card_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.update_kanban_card(card_id, body)
    except (RuntimeError, ValueError) as e:
        raise _kanban_http_error(e) from e


@router.post("/kanban/cards/{card_id}/move")
async def move_kanban_card(
    card_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.move_kanban_card(card_id, body.get("column_id", ""), body.get("position", 0))
    except (RuntimeError, ValueError) as e:
        raise _kanban_http_error(e) from e


@router.post("/kanban/cards/{card_id}/archive")
async def archive_kanban_card(card_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.archive_kanban_card(card_id)
    except (RuntimeError, ValueError) as e:
        raise _kanban_http_error(e) from e


@router.post("/kanban/cards/{card_id}/link-session")
async def link_kanban_card_to_session(
    card_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.link_kanban_card_to_session(card_id, body.get("session_id", ""))
    except (RuntimeError, ValueError) as e:
        raise _kanban_http_error(e) from e


@router.post("/kanban/cards/{card_id}/link-run")
async def link_kanban_card_to_run(
    card_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.link_kanban_card_to_run(card_id, body.get("run_id", ""))
    except (RuntimeError, ValueError) as e:
        raise _kanban_http_error(e) from e


# ---------------------------------------------------------------------------
# Artifacts
# ---------------------------------------------------------------------------


def _artifact_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 404 if "not found" in message.lower() else 400
    return HTTPException(
        status_code=status_code,
        detail=_error_detail("artifact_error", message, source="studio"),
    )


@router.get("/artifacts")
async def list_artifacts(
    type: str | None = Query(None, description="Artifact type filter"),
    source: str | None = Query(None, description="Artifact source filter"),
    run_id: str | None = Query(None, description="Linked run id"),
    session_id: str | None = Query(None, description="Linked session id"),
    card_id: str | None = Query(None, description="Linked Kanban card id"),
    search: str | None = Query(None, description="Search title and description"),
    include_archived: bool = Query(False, description="Include archived artifacts"),
    limit: int = Query(100, ge=1, le=250),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.list_artifacts(
            {
                "artifact_type": type,
                "source": source,
                "run_id": run_id,
                "session_id": session_id,
                "card_id": card_id,
                "search": search,
                "include_archived": include_archived,
                "limit": limit,
            }
        )
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.get("/artifacts/{artifact_id}")
async def get_artifact(artifact_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.get_artifact(artifact_id)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifacts")
async def create_artifact(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.create_artifact(body)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.patch("/artifacts/{artifact_id}")
async def update_artifact(
    artifact_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.update_artifact(artifact_id, body)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifacts/{artifact_id}/archive")
async def archive_artifact(artifact_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.archive_artifact(artifact_id)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifacts/{artifact_id}/link-run")
async def link_artifact_to_run(
    artifact_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.link_artifact_to_run(artifact_id, body.get("run_id", ""))
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifacts/{artifact_id}/link-session")
async def link_artifact_to_session(
    artifact_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.link_artifact_to_session(artifact_id, body.get("session_id", ""))
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifacts/{artifact_id}/link-card")
async def link_artifact_to_card(
    artifact_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.link_artifact_to_card(artifact_id, body.get("kanban_card_id", body.get("card_id", "")))
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


# ---------------------------------------------------------------------------
# Context Inspector
# ---------------------------------------------------------------------------


def _context_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 400
    return HTTPException(
        status_code=status_code,
        detail=_error_detail("context_error", message, source="studio"),
    )


@router.get("/context/current")
async def get_current_context(
    workspace_path: str | None = Query(None, description="Selected Studio workspace path"),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await ContextRepository().current(backend, _backend_status, workspace_path=workspace_path)
    except (RuntimeError, ValueError) as e:
        raise _context_http_error(e) from e


@router.get("/context/runs/{run_id}")
async def get_run_context(run_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await ContextRepository().for_run(backend, _backend_status, run_id)
    except (RuntimeError, ValueError) as e:
        raise _context_http_error(e) from e


@router.get("/context/sessions/{session_id}")
async def get_session_context(session_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await ContextRepository().for_session(backend, _backend_status, session_id)
    except (RuntimeError, ValueError) as e:
        raise _context_http_error(e) from e


@router.get("/context/workspaces/current")
async def get_current_workspace_context(
    workspace_path: str | None = Query(None, description="Selected Studio workspace path"),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await ContextRepository().workspace_current(backend, _backend_status, workspace_path=workspace_path)
    except (RuntimeError, ValueError) as e:
        raise _context_http_error(e) from e


# ---------------------------------------------------------------------------
# Process Management
# ---------------------------------------------------------------------------


def _process_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 404 if "not found" in message.lower() else 400
    return HTTPException(
        status_code=status_code,
        detail=_error_detail("process_error", message, source="studio"),
    )


@router.get("/processes")
async def list_processes(_token: None = Depends(require_token)) -> dict[str, Any]:
    manager = get_process_manager()
    return {
        "processes": manager.list_processes(),
        "templates": manager.list_templates(),
    }


@router.post("/processes/start")
async def start_process(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    manager = get_process_manager()
    template_id = body.get("template_id", "")
    cwd = body.get("cwd")
    env_overrides = body.get("env")
    try:
        return await manager.start_process(template_id, cwd=cwd, env_overrides=env_overrides)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=_error_detail("process_start_error", str(e), source="studio"),
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=_error_detail("process_start_error", str(e), source="studio", retryable=True),
        ) from e


@router.post("/processes/{process_id}/stop")
async def stop_process(process_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    manager = get_process_manager()
    try:
        return await manager.stop_process(process_id)
    except ValueError as e:
        raise _process_http_error(e) from e


@router.get("/processes/{process_id}/logs")
async def get_process_logs(
    process_id: str,
    tail: int = Query(200, ge=1, le=5000),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    manager = get_process_manager()
    try:
        return manager.get_logs(process_id, tail=tail)
    except ValueError as e:
        raise _process_http_error(e) from e


@router.delete("/processes/{process_id}")
async def remove_process(process_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    manager = get_process_manager()
    try:
        removed = manager.remove_process(process_id)
        return {"removed": removed}
    except ValueError as e:
        raise _process_http_error(e) from e


# ---------------------------------------------------------------------------
# Delegations (read-only)
# ---------------------------------------------------------------------------


def _delegation_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 404 if "not found" in message.lower() else 400
    return HTTPException(
        status_code=status_code,
        detail=_error_detail("delegation_error", message, source="studio"),
    )


@router.get("/delegations")
async def list_delegations(
    parent_run_id: str | None = Query(None, description="Filter by parent run ID"),
    status: str | None = Query(None, description="Filter by delegation status"),
    limit: int = Query(100, ge=1, le=250),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    try:
        return DelegationRepository().list_delegations(
            parent_run_id=parent_run_id,
            status=status,
            limit=limit,
        )
    except (RuntimeError, ValueError) as e:
        raise _delegation_http_error(e) from e


@router.get("/delegations/{delegation_id}")
async def get_delegation(delegation_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        return DelegationRepository().get_delegation(delegation_id)
    except (RuntimeError, ValueError) as e:
        raise _delegation_http_error(e) from e


# ---------------------------------------------------------------------------
# Cron Jobs (read-only)
# ---------------------------------------------------------------------------


def _cron_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 404 if "not found" in message.lower() else 400
    return HTTPException(
        status_code=status_code,
        detail=_error_detail("cron_error", message, source="studio"),
    )


@router.get("/cron-jobs")
async def list_cron_jobs(
    limit: int = Query(100, ge=1, le=250),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    try:
        return CronRepository().list_jobs(limit=limit)
    except (RuntimeError, ValueError) as e:
        raise _cron_http_error(e) from e


@router.get("/cron-jobs/{job_id}")
async def get_cron_job(job_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        return CronRepository().get_job(job_id)
    except (RuntimeError, ValueError) as e:
        raise _cron_http_error(e) from e


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
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_request", "key is required"),
        )
    try:
        return await backend.patch_config(key, value)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=_error_detail("config_error", str(e)),
        ) from e


# ---------------------------------------------------------------------------
# Checkpoints (read-only)
# ---------------------------------------------------------------------------


def _checkpoint_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 404 if "not found" in message.lower() else 400
    return HTTPException(
        status_code=status_code,
        detail=_error_detail("checkpoint_error", message, source="studio"),
    )


@router.get("/checkpoints")
async def list_checkpoints(
    workspace_path: str = Query(..., description="Workspace path to scan for checkpoints"),
    limit: int = Query(100, ge=1, le=500),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    try:
        return CheckpointRepository().list_checkpoints(workspace_path, limit=limit)
    except (RuntimeError, ValueError) as e:
        raise _checkpoint_http_error(e) from e


@router.get("/checkpoints/{commit_hash}")
async def get_checkpoint(
    commit_hash: str,
    workspace_path: str = Query(..., description="Workspace path"),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    try:
        return CheckpointRepository().get_checkpoint(workspace_path, commit_hash)
    except (RuntimeError, ValueError) as e:
        raise _checkpoint_http_error(e) from e


@router.get("/checkpoints/{commit_hash}/diff")
async def get_checkpoint_diff(
    commit_hash: str,
    workspace_path: str = Query(..., description="Workspace path"),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    try:
        return CheckpointRepository().get_diff(workspace_path, commit_hash)
    except (RuntimeError, ValueError) as e:
        raise _checkpoint_http_error(e) from e


# ---------------------------------------------------------------------------
# Worktrees
# ---------------------------------------------------------------------------


def _worktree_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 404 if "not found" in message.lower() else 400
    return HTTPException(
        status_code=status_code,
        detail=_error_detail("worktree_error", message, source="studio"),
    )


@router.get("/worktrees")
async def list_worktrees(
    workspace_path: str = Query(..., description="Workspace path"),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    try:
        return WorktreeRepository().list_worktrees(workspace_path)
    except (RuntimeError, ValueError) as e:
        raise _worktree_http_error(e) from e


@router.post("/worktrees")
async def create_worktree(
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    workspace_path = body.get("workspace_path", "")
    branch = body.get("branch", "")
    new_branch = body.get("new_branch", True)
    if not workspace_path:
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_request", "workspace_path is required"),
        )
    if not branch:
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_request", "branch is required"),
        )
    try:
        return WorktreeRepository().create_worktree(
            workspace_path, branch, new_branch=new_branch,
        )
    except (RuntimeError, ValueError) as e:
        raise _worktree_http_error(e) from e


@router.delete("/worktrees/{worktree_id}")
async def remove_worktree(
    worktree_id: str,
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    try:
        return WorktreeRepository().remove_worktree(worktree_id)
    except (RuntimeError, ValueError) as e:
        raise _worktree_http_error(e) from e


@router.post("/worktrees/{worktree_id}/run")
async def start_run_in_worktree(
    worktree_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    prompt = body.get("prompt", "")
    session_id = body.get("session_id", "default")
    profile = body.get("profile")

    worktree_repo = WorktreeRepository()
    try:
        wt = worktree_repo.get_worktree(worktree_id)
        if not wt:
            raise ValueError(f"Worktree not found: {worktree_id}")
    except (RuntimeError, ValueError) as e:
        raise _worktree_http_error(e) from e

    worktree_path = wt["worktree_path"]
    result = await backend.start_run(session_id, prompt, profile)
    run_id = result.get("run_id")
    if run_id:
        _persist_started_run(
            run_id=str(run_id),
            session_id=str(session_id) if session_id else None,
            status=str(result.get("status", "started")),
            prompt=str(prompt),
            backend=_backend_name(),
            model=await _model_name(backend),
            workspace_path=worktree_path,
        )
        worktree_repo.record_run(worktree_id)
    return result


# ---------------------------------------------------------------------------
# Tool Packs
# ---------------------------------------------------------------------------


def _tool_pack_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    status_code = 404 if "not found" in message.lower() else 400
    return HTTPException(
        status_code=status_code,
        detail=_error_detail("tool_pack_error", message, source="studio"),
    )


@router.get("/tool-packs")
async def list_tool_packs(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        repo = ToolPackRepository()
        return {"packs": repo.list_packs()}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=_error_detail("tool_pack_error", str(e), source="studio", retryable=True),
        ) from e


@router.get("/tool-packs/{pack_id}")
async def get_tool_pack(pack_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        repo = ToolPackRepository()
        return repo.get_pack(pack_id)
    except (RuntimeError, ValueError) as e:
        raise _tool_pack_http_error(e) from e


@router.post("/tool-packs/{pack_id}/enable")
async def enable_tool_pack(pack_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        repo = ToolPackRepository()
        return repo.enable_pack(pack_id)
    except (RuntimeError, ValueError) as e:
        raise _tool_pack_http_error(e) from e


@router.post("/tool-packs/{pack_id}/disable")
async def disable_tool_pack(pack_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        repo = ToolPackRepository()
        return repo.disable_pack(pack_id)
    except (RuntimeError, ValueError) as e:
        raise _tool_pack_http_error(e) from e


@router.post("/tool-packs/install")
async def install_tool_pack(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    source_path = body.get("path", "")
    if not source_path:
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_request", "path is required"),
        )
    try:
        repo = ToolPackRepository()
        return repo.install_pack(source_path)
    except (RuntimeError, ValueError) as e:
        raise _tool_pack_http_error(e) from e
