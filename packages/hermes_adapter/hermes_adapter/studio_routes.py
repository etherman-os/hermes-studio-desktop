"""Studio API routes — delegates to backend abstraction layer.

Supports mock and Hermes backends. Frontend always talks to /studio/* endpoints.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import subprocess
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from hermes_adapter._subprocess import run_hermes  # noqa: E402
from hermes_adapter.approval_repository import ApprovalRepository
from hermes_adapter.backend_base import StudioBackend
from hermes_adapter.checkpoint_repository import CheckpointRepository
from hermes_adapter.context_repository import ContextRepository
from hermes_adapter.cron_repository import CronRepository
from hermes_adapter.delegation_repository import DelegationRepository
from hermes_adapter.hermes_inventory_repository import HermesInventoryRepository
from hermes_adapter.process_manager import get_process_manager
from hermes_adapter.run_ledger_repository import RunLedgerRepository
from hermes_adapter.security import require_token
from hermes_adapter.studio_events import make_studio_event
from hermes_adapter.studio_storage import get_studio_storage_status
from hermes_adapter.tool_pack_repository import ToolPackRepository
from hermes_adapter.worktree_repository import WorktreeRepository

router = APIRouter(prefix="/studio")
logger = logging.getLogger(__name__)

_BROWSER_EVIDENCE_TIMEOUT_SECONDS = 45
MAX_ARTIFACT_CONTENT_SIZE = 1_000_000  # 1MB limit to prevent DoS via large content_text
_SCRIPT_TAG_RE = re.compile(r"<script\b[^<]*(?:(?!</script>)<[^<]*)*</script>", re.IGNORECASE)
_BLOCKED_EMBED_RE = re.compile(r"<(iframe|object|embed)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_EVENT_ATTR_RE = re.compile(r"\s+on[a-zA-Z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.IGNORECASE)
_JAVASCRIPT_URL_RE = re.compile(r"\s+(href|src)\s*=\s*(['\"])\s*javascript:[^'\"]*\2", re.IGNORECASE)
_CLI_SECRET_RE = re.compile(r"Bearer\s+\S+|(?i:sk-|xai-|tvly-|ghp_)[a-zA-Z0-9._-]+|\b[a-f0-9]{32,}\b")

_BACKEND_LOCK_TIMEOUT = 30.0

# Backend instance — initialized on first request
_backend: StudioBackend | None = None
_backend_status: dict[str, Any] = {}
_backend_lock = asyncio.Lock()


async def close_backend() -> None:
    """Close the global backend if it exists and has a close method."""
    global _backend
    if _backend is not None:
        close = getattr(_backend, "close", None)
        if callable(close):
            await close()
        _backend = None


def _audit_log_config_change(action: str, detail: dict[str, Any], actor: str) -> None:
    """Log a config change to the audit trail (S-4).

    Records timestamp, actor, action, and redacted key/value so that
    config mutations are auditable without exposing secrets.
    """
    try:
        from hermes_adapter.audit_logger import get_audit_logger
        audit = get_audit_logger()
        if audit:
            # Redact sensitive config values
            redacted_detail = {}
            for k, v in detail.items():
                if k in ("value", "token", "key", "secret", "password", "api_key"):
                    redacted_detail[k] = "[REDACTED]"
                elif isinstance(v, str) and len(v) > 64:
                    redacted_detail[k] = v[:64] + "...[TRUNCATED]"
                else:
                    redacted_detail[k] = v
            audit.log_config_change(
                actor=actor,
                resource="studio.config",
                detail={"action": action, **redacted_detail},
            )
    except Exception:  # noqa: S110 — Audit logging must never break config mutations
        pass


async def _get_backend() -> StudioBackend:
    """Get or create the backend instance."""
    global _backend, _backend_status
    if _backend is not None:
        return _backend

    async with _backend_lock:
        # Double-check after acquiring lock
        if _backend is not None:
            return _backend
        from hermes_adapter.backend_factory import create_backend
        try:
            backend_future = asyncio.create_task(create_backend())
            result = await asyncio.wait_for(backend_future, timeout=_BACKEND_LOCK_TIMEOUT)
            _backend, _backend_status = result
        except TimeoutError:
            logger.error("Backend initialization timed out after %.1fs", _BACKEND_LOCK_TIMEOUT)
            raise HTTPException(
                status_code=503,
                detail=_error_detail("backend_unavailable", "Backend initialization timed out", retryable=True),
            ) from None
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


def _auto_fell_back_to_mock() -> bool:
    return _backend_status.get("backend_mode") == "auto" and _backend_name() == "mock"


async def _patch_model_config_via_local_hermes(body: dict[str, Any]) -> dict[str, Any]:
    from hermes_adapter.backend_config import get_hermes_api_key, get_hermes_api_url
    from hermes_adapter.hermes_backend import HermesBackend

    backend = HermesBackend(get_hermes_api_url(), get_hermes_api_key())
    try:
        result = await backend.patch_model_config(body)
        result["active_backend"] = "hermes_cli"
        result["gateway_connected"] = False
        return result
    finally:
        if hasattr(backend, "close") and callable(backend.close):
            await backend.close()


async def _patch_config_via_local_hermes(key: str, value: Any) -> dict[str, Any]:
    from hermes_adapter.backend_config import get_hermes_api_key, get_hermes_api_url
    from hermes_adapter.hermes_backend import HermesBackend

    backend = HermesBackend(get_hermes_api_url(), get_hermes_api_key())
    try:
        result = await backend.patch_config(key, value)
        result["active_backend"] = "hermes_cli"
        result["gateway_connected"] = False
        return result
    finally:
        if hasattr(backend, "close") and callable(backend.close):
            await backend.close()


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


def _run_compare_summary(ledger: dict[str, Any]) -> dict[str, Any]:
    raw_run = ledger.get("run")
    run: dict[str, Any] = raw_run if isinstance(raw_run, dict) else {}
    raw_events = ledger.get("events")
    events: list[Any] = raw_events if isinstance(raw_events, list) else []
    event_type_counts: dict[str, int] = {}
    tool_names: set[str] = set()
    warnings = 0
    errors = 0
    approvals = 0
    assistant_chars = 0
    for event in events:
        if not isinstance(event, dict):
            continue
        event_type = str(event.get("type") or "unknown")
        event_type_counts[event_type] = event_type_counts.get(event_type, 0) + 1
        payload = event.get("payload")
        if not isinstance(payload, dict):
            payload = {}
        if event_type in {"adapter.warning", "run.cancelled"}:
            warnings += 1
        if event_type == "run.failed" or (event_type == "tool.completed" and payload.get("success") is False):
            errors += 1
        if event_type in {"approval.requested", "approval.resolved"}:
            approvals += 1
        if event_type in {"tool.started", "tool.completed", "tool.progress"}:
            tool = payload.get("tool") or payload.get("name")
            if tool:
                tool_names.add(str(tool))
        if event_type == "assistant.delta":
            text = payload.get("text") or payload.get("content")
            if isinstance(text, str):
                assistant_chars += len(text)
    return {
        "run_id": run.get("id"),
        "status": run.get("status"),
        "backend": run.get("backend"),
        "model": run.get("model"),
        "workspace_path": run.get("workspace_path"),
        "duration_ms": run.get("duration_ms"),
        "event_count": len(events),
        "event_type_counts": event_type_counts,
        "tool_names": sorted(tool_names),
        "warning_count": warnings,
        "error_count": errors,
        "approval_count": approvals,
        "assistant_chars": assistant_chars,
    }


def _run_compare_delta(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    raw_left_types = left.get("event_type_counts")
    raw_right_types = right.get("event_type_counts")
    left_types: dict[str, Any] = raw_left_types if isinstance(raw_left_types, dict) else {}
    right_types: dict[str, Any] = raw_right_types if isinstance(raw_right_types, dict) else {}
    event_type_delta = {
        key: int(right_types.get(key, 0)) - int(left_types.get(key, 0))
        for key in sorted(set(left_types) | set(right_types))
    }
    raw_left_tools = left.get("tool_names")
    raw_right_tools = right.get("tool_names")
    left_tools = {str(item) for item in raw_left_tools} if isinstance(raw_left_tools, list) else set()
    right_tools = {str(item) for item in raw_right_tools} if isinstance(raw_right_tools, list) else set()
    left_duration = left.get("duration_ms")
    right_duration = right.get("duration_ms")
    duration_delta = None
    if isinstance(left_duration, int) and isinstance(right_duration, int):
        duration_delta = right_duration - left_duration
    return {
        "status_changed": left.get("status") != right.get("status"),
        "model_changed": left.get("model") != right.get("model"),
        "backend_changed": left.get("backend") != right.get("backend"),
        "duration_delta_ms": duration_delta,
        "event_count_delta": int(right.get("event_count") or 0) - int(left.get("event_count") or 0),
        "warning_delta": int(right.get("warning_count") or 0) - int(left.get("warning_count") or 0),
        "error_delta": int(right.get("error_count") or 0) - int(left.get("error_count") or 0),
        "assistant_char_delta": int(right.get("assistant_chars") or 0) - int(left.get("assistant_chars") or 0),
        "added_tools": sorted(right_tools - left_tools),
        "removed_tools": sorted(left_tools - right_tools),
        "event_type_delta": event_type_delta,
    }


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
    except (ValueError, RuntimeError) as e:
        raise HTTPException(
            status_code=500,
            detail=_error_detail("bootstrap_error", str(e), retryable=True),
        ) from e
    except Exception as e:
        logger.exception("Unexpected bootstrap error: %s", e)
        raise HTTPException(
            status_code=500,
            detail=_error_detail("bootstrap_error", "An unexpected error occurred during bootstrap", retryable=True),
        ) from e


# ---------------------------------------------------------------------------
# Local Hermes Inventory
# ---------------------------------------------------------------------------


def _inventory_http_error(error: Exception) -> HTTPException:
    return HTTPException(
        status_code=500,
        detail=_error_detail(
            "hermes_inventory_error",
            str(error),
            source="studio",
            retryable=True,
        ),
    )


async def _run_local_hermes(args: list[str], *, timeout: int = 15) -> subprocess.CompletedProcess[str]:
    def _run() -> subprocess.CompletedProcess[str]:
        # S603/S607: hermes_path resolved via shutil.which(); args are hardcoded/internal
        return run_hermes(args, timeout=float(timeout), check_returncode=None)  # noqa: S603, S607

    return await asyncio.to_thread(_run)


def _parse_cli_capabilities(root_help: str, chat_help: str) -> dict[str, Any]:
    commands = [
        "chat",
        "model",
        "fallback",
        "gateway",
        "kanban",
        "skills",
        "tools",
        "mcp",
        "sessions",
        "checkpoints",
        "dashboard",
        "acp",
        "profile",
        "logs",
        "update",
    ]
    flags = [
        "--image",
        "--provider",
        "--model",
        "--toolsets",
        "--skills",
        "--resume",
        "--continue",
        "--worktree",
        "--accept-hooks",
        "--checkpoints",
        "--max-turns",
        "--pass-session-id",
        "--ignore-user-config",
        "--ignore-rules",
        "--source",
    ]
    return {
        "commands": {name: name in root_help for name in commands},
        "chat_flags": {flag.lstrip("-").replace("-", "_"): flag in chat_help for flag in flags},
    }


def _redact_cli_line(line: str) -> str:
    return _CLI_SECRET_RE.sub("[REDACTED]", line)


def _parse_hermes_doctor_output(text: str) -> dict[str, Any]:
    checks: list[dict[str, str]] = []
    lines: list[str] = []
    section = ""
    for raw_line in text.splitlines():
        line = _redact_cli_line(raw_line.rstrip())
        if not line.strip():
            continue
        lines.append(line)
        stripped = line.strip()
        if stripped.startswith("◆ "):
            section = stripped[2:].strip()
            continue
        marker = stripped[:1]
        if marker not in {"✓", "⚠", "✗", "✕"}:
            continue
        level = "ok" if marker == "✓" else "warning" if marker == "⚠" else "error"
        checks.append({
            "section": section or "General",
            "level": level,
            "message": stripped[1:].strip(),
        })
    return {
        "lines": lines,
        "checks": checks,
        "ok_count": sum(1 for check in checks if check["level"] == "ok"),
        "warning_count": sum(1 for check in checks if check["level"] == "warning"),
        "error_count": sum(1 for check in checks if check["level"] == "error"),
    }


def _checkpoint_status_from_result(result: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    lines = [line.rstrip() for line in result.stdout.splitlines() if line.strip()]
    if result.returncode != 0:
        return {"available": False, "error": (result.stderr or result.stdout).strip(), "lines": lines}
    parsed: dict[str, Any] = {}
    for line in lines:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        parsed[key.strip().lower().replace(" ", "_").replace("-", "_")] = value.strip()
    return {"available": True, "lines": lines, "status": parsed}


def _parse_mcp_test_output(text: str, *, exit_code: int) -> dict[str, Any]:
    lines: list[str] = []
    status = "ok" if exit_code == 0 else "error"
    message: str | None = None
    for raw_line in text.splitlines():
        line = _redact_cli_line(raw_line.rstrip())
        if not line.strip():
            continue
        lines.append(line)
        stripped = line.strip()
        marker = stripped[:1]
        lower = stripped.casefold()
        if marker in {"✗", "✕"} or "connection failed" in lower or "failed" in lower:
            status = "error"
            message = stripped[1:].strip() if marker in {"✗", "✕"} else stripped
        elif marker == "⚠" and status != "error":
            status = "warning"
            message = stripped[1:].strip()
        elif marker == "✓" and message is None:
            message = stripped[1:].strip()
    if message is None and lines:
        message = lines[-1].strip()
    return {"status": status, "ok": status == "ok", "message": message, "lines": lines}


def _browser_cache_status() -> dict[str, Any]:
    cache_root = Path.home() / ".cache"
    playwright_dir = cache_root / "ms-playwright"
    puppeteer_dir = cache_root / "puppeteer"

    def _children(path: Path) -> list[str]:
        if not path.is_dir():
            return []
        try:
            return sorted(child.name for child in path.iterdir() if child.is_dir())[:40]
        except OSError:
            return []

    playwright_entries = _children(playwright_dir)
    puppeteer_entries = _children(puppeteer_dir)
    playwright_chromium = any(entry.startswith(("chromium-", "chromium_headless_shell-")) for entry in playwright_entries)
    puppeteer_chrome = any(entry.startswith(("chrome", "chromium")) for entry in puppeteer_entries)
    return {
        "playwright_cache_dir": str(playwright_dir),
        "playwright_cache_exists": playwright_dir.is_dir(),
        "playwright_browsers": playwright_entries,
        "playwright_chromium_installed": playwright_chromium,
        "puppeteer_cache_dir": str(puppeteer_dir),
        "puppeteer_cache_exists": puppeteer_dir.is_dir(),
        "puppeteer_browsers": puppeteer_entries,
        "puppeteer_chrome_installed": puppeteer_chrome,
        "note": (
            "Playwright and Puppeteer use separate browser caches. Do not reinstall Playwright browsers "
            "when ~/.cache/ms-playwright already has Chromium; install Puppeteer Chrome only if a Puppeteer-based smoke tool requires it."
        ),
    }


def _validate_optional_cli_identifier(value: Any, *, field: str, max_length: int = 240) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) > max_length or any(char in text for char in ("\x00", "\r", "\n")):
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_cli_identifier", f"Invalid {field}", source="studio"),
        )
    return text


def _skill_action_payload(
    *,
    action: str,
    result: subprocess.CompletedProcess[str],
    started: float,
    skills: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    lines = [
        _redact_cli_line(line.rstrip())
        for line in f"{result.stdout}\n{result.stderr}".splitlines()
        if line.strip()
    ]
    message = lines[-1].strip() if lines else None
    payload: dict[str, Any] = {
        "action": action,
        "available": True,
        "ok": result.returncode == 0,
        "exit_code": result.returncode,
        "duration_ms": int((perf_counter() - started) * 1000),
        "message": message,
        "error": None if result.returncode == 0 else message,
        "lines": lines,
    }
    if skills is not None:
        payload["skills"] = skills
    return payload


def _parse_hermes_release(version_text: str, update_text: str, *, update_exit_code: int) -> dict[str, Any]:
    version_lines = [_redact_cli_line(line.rstrip()) for line in version_text.splitlines() if line.strip()]
    update_lines = [_redact_cli_line(line.rstrip()) for line in update_text.splitlines() if line.strip()]
    joined = "\n".join([*version_lines, *update_lines])
    version = None
    for line in version_lines:
        match = re.search(r"Hermes Agent v([^\s]+)", line)
        if match:
            version = match.group(1)
            break
    behind_match = re.search(r"(\d+)\s+commits?\s+behind", joined, re.IGNORECASE)
    behind_count = int(behind_match.group(1)) if behind_match else None
    update_available = bool(behind_count and behind_count > 0) or "update available" in joined.casefold()
    up_to_date = "up to date" in joined.casefold() and not update_available
    return {
        "available": bool(version_lines),
        "version": version,
        "update_check_available": update_exit_code == 0,
        "update_available": update_available,
        "up_to_date": up_to_date,
        "behind_count": behind_count,
        "lines": version_lines,
        "update_lines": update_lines,
        "error": None if update_exit_code == 0 else (update_lines[-1] if update_lines else "Hermes update check failed"),
    }


@router.get("/hermes/inventory")
async def get_hermes_inventory(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        return HermesInventoryRepository().inventory()
    except Exception as e:
        raise _inventory_http_error(e) from e


@router.get("/hermes/cli")
async def get_hermes_cli(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        version = await _run_local_hermes(["--version"])
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return {"available": False, "error": str(exc), "commands": {}, "chat_flags": {}}
    if version.returncode != 0:
        return {
            "available": False,
            "error": (version.stderr or version.stdout or "Hermes CLI failed").strip(),
            "commands": {},
            "chat_flags": {},
        }
    root_help = await _run_local_hermes(["--help"])
    chat_help = await _run_local_hermes(["chat", "--help"])
    parsed = _parse_cli_capabilities(f"{root_help.stdout}\n{root_help.stderr}", f"{chat_help.stdout}\n{chat_help.stderr}")
    return {
        "available": True,
        "version": version.stdout.strip().splitlines()[0] if version.stdout.strip() else "Hermes CLI available",
        "transport": "local-cli",
        **parsed,
    }


@router.get("/hermes/release")
async def get_hermes_release(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        version = await _run_local_hermes(["version"], timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return {
            "available": False,
            "version": None,
            "update_check_available": False,
            "update_available": False,
            "up_to_date": False,
            "behind_count": None,
            "lines": [],
            "update_lines": [],
            "error": str(exc),
        }
    try:
        update = await _run_local_hermes(["update", "--check"], timeout=60)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        update = subprocess.CompletedProcess(["update", "--check"], 1, stdout="", stderr=str(exc))
    return _parse_hermes_release(
        f"{version.stdout}\n{version.stderr}",
        f"{update.stdout}\n{update.stderr}",
        update_exit_code=update.returncode,
    )


@router.get("/hermes/checkpoints/status")
async def get_hermes_checkpoint_status(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        result = await _run_local_hermes(["checkpoints", "status"])
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return {"available": False, "error": str(exc), "lines": []}
    return _checkpoint_status_from_result(result)


@router.post("/hermes/checkpoints/prune")
async def prune_hermes_checkpoint_store(body: dict[str, Any] | None = None, _token: None = Depends(require_token)) -> dict[str, Any]:
    body = body or {}
    args = ["checkpoints", "prune"]
    retention_days = body.get("retention_days")
    max_size_mb = body.get("max_size_mb")
    keep_orphans = body.get("keep_orphans")
    if retention_days is not None:
        if not isinstance(retention_days, int) or retention_days < 1 or retention_days > 3650:
            raise HTTPException(
                status_code=400,
                detail=_error_detail("invalid_checkpoint_prune_options", "retention_days must be 1-3650", source="studio"),
            )
        args.extend(["--retention-days", str(retention_days)])
    if max_size_mb is not None:
        if not isinstance(max_size_mb, int) or max_size_mb < 1 or max_size_mb > 102400:
            raise HTTPException(
                status_code=400,
                detail=_error_detail("invalid_checkpoint_prune_options", "max_size_mb must be 1-102400", source="studio"),
            )
        args.extend(["--max-size-mb", str(max_size_mb)])
    if keep_orphans is True:
        args.append("--keep-orphans")

    started = perf_counter()
    try:
        result = await _run_local_hermes(args, timeout=120)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return {
            "action": "prune",
            "available": False,
            "ok": False,
            "exit_code": None,
            "duration_ms": int((perf_counter() - started) * 1000),
            "message": str(exc),
            "error": str(exc),
            "lines": [],
        }
    lines = [
        _redact_cli_line(line.rstrip())
        for line in f"{result.stdout}\n{result.stderr}".splitlines()
        if line.strip()
    ]
    status_result = await _run_local_hermes(["checkpoints", "status"], timeout=15) if result.returncode == 0 else None
    return {
        "action": "prune",
        "available": True,
        "ok": result.returncode == 0,
        "exit_code": result.returncode,
        "duration_ms": int((perf_counter() - started) * 1000),
        "message": lines[-1] if lines else None,
        "error": None if result.returncode == 0 else (lines[-1] if lines else "Checkpoint prune failed"),
        "lines": lines,
        "status": _checkpoint_status_from_result(status_result) if status_result else None,
    }


@router.get("/hermes/doctor")
async def get_hermes_doctor(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        result = await _run_local_hermes(["doctor"], timeout=90)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return {"available": False, "error": str(exc), "lines": [], "checks": []}
    parsed = _parse_hermes_doctor_output(f"{result.stdout}\n{result.stderr}")
    return {
        "available": result.returncode == 0,
        "exit_code": result.returncode,
        "error": None if result.returncode == 0 else (result.stderr or result.stdout).strip()[:1200],
        **parsed,
    }


@router.get("/hermes/browser-cache")
async def get_hermes_browser_cache(_token: None = Depends(require_token)) -> dict[str, Any]:
    return _browser_cache_status()


@router.get("/hermes/providers")
async def list_hermes_providers(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        repo = HermesInventoryRepository()
        providers = repo.list_providers()
        return {"providers": providers, "total": len(providers), "summary": repo.summary()}
    except Exception as e:
        raise _inventory_http_error(e) from e


@router.get("/hermes/fallbacks")
async def list_hermes_fallbacks(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        repo = HermesInventoryRepository()
        fallbacks = repo.list_fallback_providers()
        return {"fallback_providers": fallbacks, "total": len(fallbacks), "summary": repo.summary()}
    except Exception as e:
        raise _inventory_http_error(e) from e


@router.get("/hermes/models")
async def list_hermes_models(
    provider: str | None = Query(None, description="Provider id filter"),
    query: str | None = Query(None, description="Case-insensitive model search"),
    limit: int | None = Query(None, ge=1, le=5000, description="Optional result limit"),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    try:
        repo = HermesInventoryRepository()
        models = repo.list_models(provider=provider, query=query, limit=limit)
        return {"models": models, "total": len(models), "summary": repo.summary()}
    except Exception as e:
        raise _inventory_http_error(e) from e


@router.get("/hermes/skills")
async def list_hermes_skills(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        repo = HermesInventoryRepository()
        skills = repo.list_skills()
        return {"skills": skills, "total": len(skills), "summary": repo.summary()}
    except Exception as e:
        raise _inventory_http_error(e) from e


@router.post("/hermes/skills/check")
async def check_hermes_skills(body: dict[str, Any] | None = None, _token: None = Depends(require_token)) -> dict[str, Any]:
    body = body or {}
    name = _validate_optional_cli_identifier(body.get("name"), field="skill name")
    args = ["skills", "check", *([name] if name else [])]
    started = perf_counter()
    try:
        result = await _run_local_hermes(args, timeout=45)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return {
            "action": "check",
            "available": False,
            "ok": False,
            "exit_code": None,
            "duration_ms": int((perf_counter() - started) * 1000),
            "message": str(exc),
            "error": str(exc),
            "lines": [],
        }
    return _skill_action_payload(action="check", result=result, started=started)


@router.post("/hermes/skills/update")
async def update_hermes_skills(body: dict[str, Any] | None = None, _token: None = Depends(require_token)) -> dict[str, Any]:
    body = body or {}
    name = _validate_optional_cli_identifier(body.get("name"), field="skill name")
    args = ["skills", "update", *([name] if name else [])]
    started = perf_counter()
    try:
        result = await _run_local_hermes(args, timeout=90)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return {
            "action": "update",
            "available": False,
            "ok": False,
            "exit_code": None,
            "duration_ms": int((perf_counter() - started) * 1000),
            "message": str(exc),
            "error": str(exc),
            "lines": [],
        }
    skills = HermesInventoryRepository().list_skills() if result.returncode == 0 else None
    return _skill_action_payload(action="update", result=result, started=started, skills=skills)


@router.post("/hermes/skills/install")
async def install_hermes_skill(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    identifier = _validate_optional_cli_identifier(body.get("identifier"), field="skill identifier", max_length=500)
    if not identifier:
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_skill_identifier", "identifier is required", source="studio"),
        )
    category = _validate_optional_cli_identifier(body.get("category"), field="skill category", max_length=120)
    name = _validate_optional_cli_identifier(body.get("name"), field="skill name", max_length=120)
    force = bool(body.get("force", False))
    args = ["skills", "install", "--yes"]
    if force:
        args.append("--force")
    if category:
        args.extend(["--category", category])
    if name:
        args.extend(["--name", name])
    args.append(identifier)

    started = perf_counter()
    try:
        result = await _run_local_hermes(args, timeout=120)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return {
            "action": "install",
            "available": False,
            "ok": False,
            "exit_code": None,
            "duration_ms": int((perf_counter() - started) * 1000),
            "message": str(exc),
            "error": str(exc),
            "lines": [],
        }
    skills = HermesInventoryRepository().list_skills() if result.returncode == 0 else None
    return _skill_action_payload(action="install", result=result, started=started, skills=skills)


@router.get("/hermes/mcp-servers")
async def list_hermes_mcp_servers(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        repo = HermesInventoryRepository()
        servers = repo.list_mcp_servers()
        return {"mcp_servers": servers, "total": len(servers), "summary": repo.summary()}
    except Exception as e:
        raise _inventory_http_error(e) from e


@router.post("/hermes/mcp-servers/{server_id}/test")
async def test_hermes_mcp_server(server_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    clean_id = server_id.strip()
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", clean_id):
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_mcp_server", "Invalid MCP server id", source="studio"),
        )
    try:
        repo = HermesInventoryRepository()
        known_servers = {str(server.get("id")) for server in repo.list_mcp_servers()}
    except Exception as e:
        raise _inventory_http_error(e) from e
    if clean_id not in known_servers:
        raise HTTPException(
            status_code=404,
            detail=_error_detail("mcp_server_not_found", f"MCP server '{clean_id}' is not configured", source="studio"),
        )

    started = perf_counter()
    try:
        result = await _run_local_hermes(["mcp", "test", clean_id], timeout=45)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return {
            "server_id": clean_id,
            "available": False,
            "ok": False,
            "status": "error",
            "exit_code": None,
            "duration_ms": int((perf_counter() - started) * 1000),
            "error": str(exc),
            "message": str(exc),
            "lines": [],
        }

    parsed = _parse_mcp_test_output(f"{result.stdout}\n{result.stderr}", exit_code=result.returncode)
    return {
        "server_id": clean_id,
        "available": True,
        "exit_code": result.returncode,
        "duration_ms": int((perf_counter() - started) * 1000),
        "error": None if parsed["ok"] else (parsed.get("message") or result.stderr or result.stdout),
        **parsed,
    }


@router.get("/hermes/toolsets")
async def list_hermes_toolsets(_token: None = Depends(require_token)) -> dict[str, Any]:
    try:
        repo = HermesInventoryRepository()
        toolsets = repo.list_toolsets()
        return {"toolsets": toolsets, "total": len(toolsets), "summary": repo.summary()}
    except Exception as e:
        raise _inventory_http_error(e) from e


@router.post("/hermes/toolsets/configure")
async def configure_hermes_toolset(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    target = str(body.get("id") or "").strip()
    platform = str(body.get("platform") or "cli").strip() or "cli"
    enabled = body.get("enabled")
    if not target or not re.fullmatch(r"[A-Za-z0-9_.:*:-]{1,120}", target):
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_toolset", "Invalid toolset id", source="studio"),
        )
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", platform):
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_toolset_platform", "Invalid toolset platform", source="studio"),
        )
    if not isinstance(enabled, bool):
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_toolset_state", "enabled must be a boolean", source="studio"),
        )

    try:
        repo = HermesInventoryRepository()
        known = repo.list_toolsets()
    except Exception as e:
        raise _inventory_http_error(e) from e

    if not any(str(item.get("id")) == target and str(item.get("platform")) == platform for item in known):
        raise HTTPException(
            status_code=404,
            detail=_error_detail("toolset_not_found", f"Toolset '{platform}:{target}' is not known to Hermes", source="studio"),
        )

    action = "enable" if enabled else "disable"
    cli_platform = "cli" if ":" in target else platform
    try:
        result = await _run_local_hermes(["tools", action, "--platform", cli_platform, target], timeout=20)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        raise HTTPException(
            status_code=503,
            detail=_error_detail("toolset_configure_unavailable", str(exc), source="hermes", retryable=True),
        ) from exc
    output = "\n".join(_redact_cli_line(line.rstrip()) for line in f"{result.stdout}\n{result.stderr}".splitlines() if line.strip())
    if result.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=_error_detail(
                "toolset_configure_failed",
                output or f"hermes tools {action} failed",
                source="hermes",
                retryable=True,
            ),
        )

    refreshed = HermesInventoryRepository().list_toolsets()
    return {
        "status": "configured",
        "id": target,
        "platform": platform,
        "enabled": enabled,
        "source": "hermes tools",
        "message": output,
        "toolsets": refreshed,
    }


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
        except Exception:  # noqa: S110 — SSE event recording is non-critical after approval already succeeded
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
        except Exception:  # noqa: S110 — SSE event recording is non-critical after approval already succeeded
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
async def start_run(
    body: dict[str, Any],
    _token: None = Depends(require_token),
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Start a new run.

    NOTE: This endpoint is NOT idempotent. Retries with the same session_id
    and prompt may create duplicate runs. Clients must track run_id from the
    response and avoid retrying unless they receive a network error before
    getting a response. For safe retries, the caller should generate and
    pass an X-Idempotency-Key header (future enhancement).
    """
    backend = await _get_backend()
    session_id = body.get("session_id", "default")
    prompt = body.get("prompt", "")
    profile = body.get("profile")
    context = body.get("context", {})
    workspace_path = body.get("workspace_path")
    if not workspace_path and isinstance(context, dict):
        workspace_path = context.get("workspace_path")
    result = await backend.start_run(session_id, prompt, profile, context if isinstance(context, dict) else None)
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


@router.get("/runs/compare")
async def compare_runs(
    left_run_id: str = Query(..., description="Baseline run id"),
    right_run_id: str = Query(..., description="Comparison run id"),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    try:
        repo = RunLedgerRepository()
        left = _run_compare_summary(repo.get_ledger(left_run_id))
        right = _run_compare_summary(repo.get_ledger(right_run_id))
        return {
            "left": left,
            "right": right,
            "delta": _run_compare_delta(left, right),
            "history_available": True,
        }
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
        try:
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
        except asyncio.CancelledError:
            # Client disconnected — emit an interrupted event before closing.
            interrupted = make_studio_event(
                "run.interrupted",
                {"run_id": run_id, "reason": "client_disconnected"},
                source="studio",
                run_id=run_id,
            )
            _persist_run_event(run_id, interrupted)
            yield _sse(interrupted)
            return
        except Exception as exc:
            logger.exception("SSE stream error for run_id=%s: %s", run_id, exc)
            interrupted = make_studio_event(
                "run.interrupted",
                {"run_id": run_id, "reason": "stream_error", "message": str(exc)},
                source="studio",
                run_id=run_id,
            )
            _persist_run_event(run_id, interrupted)
            yield _sse(interrupted)
            return
        finally:
            warned_about_run_persistence = False
            warned_about_approval_persistence = False

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


@router.patch("/model-config")
async def patch_model_config(body: dict[str, Any], _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    if not body:
        raise HTTPException(
            status_code=400,
            detail=_error_detail("invalid_request", "At least one model config field is required"),
        )
    # Audit log for model config changes
    _audit_log_config_change("patch_model_config", body, actor="studio-user")
    try:
        if _auto_fell_back_to_mock():
            result = await _patch_model_config_via_local_hermes(body)
        else:
            result = await backend.patch_model_config(body)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=_error_detail("model_config_error", str(e)),
        ) from e

    if result.get("status") == "not_implemented":
        raise HTTPException(
            status_code=501,
            detail=_error_detail(
                "not_implemented",
                result.get("message", "Model config mutation is not supported by this backend"),
                source="adapter",
                hint=(
                    "Hermes config files are read-only through Studio until Hermes exposes a safe "
                    "public API or CLI for model config mutation."
                ),
            ),
        )
    return result


@router.get("/model-config/models")
async def list_available_models(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    return {"models": await backend.list_available_models()}


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


def _browser_evidence_dir() -> Path:
    status = get_studio_storage_status()
    if not status.get("available"):
        raise RuntimeError("Studio storage is unavailable; browser evidence cannot be stored")
    evidence_dir = Path(str(status["data_dir"])) / "browser-evidence"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    try:
        evidence_dir.chmod(0o700)
    except OSError:
        logger.debug("Could not chmod browser evidence directory %s", evidence_dir)
    return evidence_dir


def _browser_evidence_script_path() -> Path:
    return Path(__file__).resolve().parents[3] / "apps" / "desktop-studio" / "scripts" / "browser-evidence.mjs"


def _safe_browser_preview_html(content: str) -> str:
    cleaned = _SCRIPT_TAG_RE.sub("", content)
    cleaned = _BLOCKED_EMBED_RE.sub("", cleaned)
    cleaned = _EVENT_ATTR_RE.sub("", cleaned)
    cleaned = _JAVASCRIPT_URL_RE.sub("", cleaned)
    csp = (
        '<meta http-equiv="Content-Security-Policy" '
        'content="default-src \'none\'; img-src data: blob: file: http: https:; '
        "style-src 'unsafe-inline' file: http: https:; font-src data: file: http: https:; "
        "connect-src 'none'; script-src 'none'; form-action 'none'; base-uri 'none'\">"
    )
    if re.search(r"<head\b[^>]*>", cleaned, re.IGNORECASE):
        return re.sub(r"(<head\b[^>]*>)", rf"\1{csp}", cleaned, count=1, flags=re.IGNORECASE)
    return f"<!doctype html><html><head>{csp}</head><body>{cleaned}</body></html>"


def _browser_target_from_artifact(artifact: dict[str, Any], evidence_dir: Path) -> tuple[str, bool]:
    artifact_type = str(artifact.get("type") or "")
    content_text = artifact.get("content_text")
    if artifact_type == "html" and isinstance(content_text, str) and content_text.strip():
        preview_path = evidence_dir / f"{artifact['id']}-{uuid4().hex[:8]}.html"
        preview_path.write_text(_safe_browser_preview_html(content_text), encoding="utf-8")
        return preview_path.resolve().as_uri(), True

    raw_target = artifact.get("content_url") or artifact.get("file_path")
    if isinstance(raw_target, str) and raw_target.strip():
        target = raw_target.strip()
        parsed = urlparse(target)
        if parsed.scheme in {"http", "https", "file"}:
            return target, False
        target_path = Path(target).expanduser()
        if not target_path.exists():
            raise ValueError(f"Artifact target does not exist: {target}")
        return target_path.resolve().as_uri(), False

    raise ValueError("Artifact has no browser-openable HTML content, URL, or local file path")


async def _run_browser_evidence_script(
    target_url: str,
    screenshot_path: Path,
    *,
    disable_javascript: bool,
) -> dict[str, Any]:
    script_path = _browser_evidence_script_path()
    if not script_path.exists():
        raise RuntimeError(f"Browser evidence runner is missing: {script_path}")

    command = ["node", str(script_path), target_url, str(screenshot_path)]
    if disable_javascript:
        command.append("--disable-js")

    process = await asyncio.create_subprocess_exec(
        *command,
        cwd=str(script_path.parents[1]),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=_BROWSER_EVIDENCE_TIMEOUT_SECONDS,
        )
    except TimeoutError as exc:
        process.kill()
        await process.communicate()
        raise RuntimeError("Browser evidence runner timed out") from exc

    stdout_text = stdout.decode("utf-8", errors="replace").strip()
    stderr_text = stderr.decode("utf-8", errors="replace").strip()
    if process.returncode != 0:
        detail = stderr_text or stdout_text or f"exit code {process.returncode}"
        raise RuntimeError(f"Browser evidence runner failed: {detail[-1200:]}")

    try:
        parsed = json.loads(stdout_text.splitlines()[-1])
        if not isinstance(parsed, dict):
            raise RuntimeError("Browser evidence runner returned a non-object JSON payload")
        return parsed
    except (IndexError, json.JSONDecodeError) as exc:
        detail = stdout_text or stderr_text or "empty output"
        raise RuntimeError(f"Browser evidence runner returned invalid JSON: {detail[-1200:]}") from exc


def _short_artifact_title(prefix: str, title: str) -> str:
    full_title = f"{prefix} · {title}".strip()
    return full_title[:200]


def _browser_evidence_report(
    *,
    artifact: dict[str, Any],
    target_url: str,
    screenshot_path: Path,
    evidence: dict[str, Any],
    disable_javascript: bool,
) -> str:
    checks_raw = evidence.get("checks")
    checks: dict[str, Any] = checks_raw if isinstance(checks_raw, dict) else {}
    console_messages_raw = evidence.get("console_messages")
    console_messages: list[Any] = console_messages_raw if isinstance(console_messages_raw, list) else []
    page_errors_raw = evidence.get("page_errors")
    page_errors: list[Any] = page_errors_raw if isinstance(page_errors_raw, list) else []
    response_status = evidence.get("response_status")
    title = evidence.get("title") or "(untitled)"
    final_url = evidence.get("final_url") or target_url

    lines = [
        "# Browser Evidence",
        "",
        f"- Source artifact: {artifact.get('title')} ({artifact.get('id')})",
        f"- Target: `{target_url}`",
        f"- Final URL: `{final_url}`",
        f"- Page title: {title}",
        f"- HTTP status: {response_status if response_status is not None else 'n/a'}",
        f"- JavaScript: {'disabled for sanitized artifact HTML' if disable_javascript else 'enabled'}",
        f"- Screenshot: `{screenshot_path}`",
        f"- Captured at: {datetime.now(UTC).isoformat()}",
        "",
        "## Checks",
        "",
        f"- Body text length: {checks.get('body_text_length', 0)}",
        f"- Headings: {checks.get('heading_count', 0)}",
        f"- Buttons/links missing accessible names: {checks.get('unnamed_action_count', 0)}",
        f"- Images missing alt text: {checks.get('images_missing_alt_count', 0)}",
        f"- Horizontal overflow: {'yes' if checks.get('horizontal_overflow') else 'no'}",
        f"- Visible focusable elements: {checks.get('focusable_count', 0)}",
        "",
        "## Console And Runtime",
        "",
    ]
    if not console_messages and not page_errors:
        lines.append("No console warnings, console errors, or page runtime errors were captured.")
    for item in console_messages[:12]:
        if isinstance(item, dict):
            lines.append(f"- [{item.get('type', 'console')}] {str(item.get('text', ''))[:500]}")
    for item in page_errors[:12]:
        if isinstance(item, dict):
            lines.append(f"- [pageerror] {str(item.get('message', ''))[:500]}")
    navigation_error = evidence.get("navigation_error")
    if navigation_error:
        lines.extend(["", "## Navigation Warning", "", str(navigation_error)[:1000]])
    return "\n".join(lines)


def _browser_evidence_http_error(error: ValueError | RuntimeError) -> HTTPException:
    message = str(error)
    if "not found" in message.lower():
        status_code = 404
        code = "artifact_error"
    elif isinstance(error, ValueError):
        status_code = 400
        code = "artifact_error"
    else:
        status_code = 503
        code = "browser_evidence_error"
    return HTTPException(
        status_code=status_code,
        detail=_error_detail(code, message, source="studio", retryable=status_code >= 500),
    )


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


@router.get("/artifacts/{artifact_id}/revisions")
async def list_artifact_revisions(
    artifact_id: str,
    include_content: bool = Query(False, description="Include bounded revision content for local diff views"),
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.list_artifact_revisions(artifact_id, include_content=include_content)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifacts/{artifact_id}/revert")
async def revert_artifact(
    artifact_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        version = body.get("version")
        if isinstance(version, bool) or not isinstance(version, int):
            raise ValueError("version must be an integer")
        return await backend.revert_artifact(artifact_id, version)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.get("/artifacts/{artifact_id}/variant-groups")
async def list_artifact_variant_groups(artifact_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.list_artifact_variant_groups(artifact_id)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifacts/{artifact_id}/variant-groups")
async def create_artifact_variant_group(
    artifact_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.create_artifact_variant_group(artifact_id, body)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifact-variant-groups/{group_id}/variants")
async def add_artifact_variant(
    group_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.add_artifact_variant(group_id, body)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifact-variant-groups/{group_id}/apply")
async def apply_artifact_variant(
    group_id: str,
    body: dict[str, Any],
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        variant_id = body.get("variant_id")
        if not isinstance(variant_id, str) or not variant_id.strip():
            raise ValueError("variant_id is required")
        return await backend.apply_artifact_variant(group_id, variant_id)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifacts/{artifact_id}/archive")
async def archive_artifact(artifact_id: str, _token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        return await backend.archive_artifact(artifact_id)
    except (RuntimeError, ValueError) as e:
        raise _artifact_http_error(e) from e


@router.post("/artifacts/{artifact_id}/browser-evidence")
async def run_artifact_browser_evidence(
    artifact_id: str,
    _token: None = Depends(require_token),
) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        artifact = await backend.get_artifact(artifact_id)
        content_text = artifact.get("content_text")
        if isinstance(content_text, str) and len(content_text.encode("utf-8")) > MAX_ARTIFACT_CONTENT_SIZE:
            raise HTTPException(
                status_code=413,
                detail=_error_detail(
                    "artifact_content_too_large",
                    f"Artifact content_text exceeds maximum size of {MAX_ARTIFACT_CONTENT_SIZE} bytes (1MB)",
                    source="studio",
                ),
            )
        evidence_dir = _browser_evidence_dir()
        target_url, disable_javascript = _browser_target_from_artifact(artifact, evidence_dir)
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        screenshot_path = evidence_dir / f"{artifact_id}-{stamp}-{uuid4().hex[:6]}.png"
        evidence = await _run_browser_evidence_script(
            target_url,
            screenshot_path,
            disable_javascript=disable_javascript,
        )
        content_text = _browser_evidence_report(
            artifact=artifact,
            target_url=target_url,
            screenshot_path=screenshot_path,
            evidence=evidence,
            disable_javascript=disable_javascript,
        )
        size_bytes = screenshot_path.stat().st_size if screenshot_path.exists() else None
        return await backend.create_artifact(
            {
                "title": _short_artifact_title("Browser evidence", str(artifact.get("title") or artifact_id)),
                "type": "report",
                "description": f"Local Playwright evidence for artifact {artifact_id}",
                "content_text": content_text,
                "file_path": str(screenshot_path) if screenshot_path.exists() else None,
                "mime_type": "image/png" if screenshot_path.exists() else "text/markdown",
                "size_bytes": size_bytes,
                "run_id": artifact.get("run_id"),
                "session_id": artifact.get("session_id"),
                "kanban_card_id": artifact.get("kanban_card_id"),
                "source": "browser_evidence",
            }
        )
    except (RuntimeError, ValueError) as e:
        raise _browser_evidence_http_error(e) from e


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
    if not isinstance(template_id, str):
        raise HTTPException(
            status_code=400,
            detail=_error_detail("process_start_error", "template_id must be a string", source="studio"),
        )
    if cwd is not None and not isinstance(cwd, str):
        raise HTTPException(
            status_code=400,
            detail=_error_detail("process_start_error", "cwd must be a string", source="studio"),
        )
    if env_overrides is not None and not isinstance(env_overrides, dict):
        raise HTTPException(
            status_code=400,
            detail=_error_detail("process_start_error", "env must be an object", source="studio"),
        )
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
    # Audit log for config changes (redacted)
    _audit_log_config_change("patch_config", {"key": key, "value": "[REDACTED]"}, actor="studio-user")
    try:
        if _auto_fell_back_to_mock():
            return await _patch_config_via_local_hermes(key, value)
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
    run_context = {"workspace_path": worktree_path}
    result = await backend.start_run(session_id, prompt, profile, context=run_context)
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
