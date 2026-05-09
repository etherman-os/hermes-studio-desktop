"""Hermes backend — real Hermes Agent API integration."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, TypeVar

import httpx

from hermes_adapter.backend_base import StudioBackend
from hermes_adapter.backend_config import get_debug_events
from hermes_adapter.config_repository import ConfigRepository
from hermes_adapter.event_normalizer import normalize_kanban_updated_payload
from hermes_adapter.log_repository import LogRepository, get_hermes_logs_dir
from hermes_adapter.profile_repository import ProfileRepository
from hermes_adapter.session_repository import SessionRepository, find_state_db, get_hermes_home
from hermes_adapter.studio_events import StudioEventSource, make_studio_event
from hermes_adapter.theme_repository import ThemeRepository

logger = logging.getLogger("hermes_adapter.hermes_backend")
_debug = get_debug_events()
_T = TypeVar("_T")


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------


class _CircuitBreaker:
    """Simple circuit breaker for API calls."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 30.0) -> None:
        self._failure_count = 0
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._last_failure_time: float = 0.0
        self._state = "closed"  # closed = healthy, open = failing, half-open = retrying

    @property
    def state(self) -> str:
        if self._state == "open" and asyncio.get_event_loop().time() - self._last_failure_time > self._recovery_timeout:
            self._state = "half-open"
        return self._state

    def record_success(self) -> None:
        self._failure_count = 0
        self._state = "closed"

    def record_failure(self) -> None:
        self._failure_count += 1
        self._last_failure_time = asyncio.get_event_loop().time()
        if self._failure_count >= self._failure_threshold:
            self._state = "open"
            logger.warning("Circuit breaker opened after %d failures", self._failure_count)

    def allow_request(self) -> bool:
        state = self.state
        if state == "closed":
            return True
        return state == "half-open"


_circuit = _CircuitBreaker()


async def _retry_with_backoff(
    func: Callable[..., Awaitable[_T]],
    *args: Any,
    max_retries: int = 3,
    base_delay: float = 0.5,
    **kwargs: Any,
) -> _T:
    """Retry an async function with exponential backoff."""
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
            last_exc = exc
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt)
                logger.warning("Retry %d/%d after %.1fs: %s", attempt + 1, max_retries, delay, exc)
                await asyncio.sleep(delay)
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("retry failed without an exception")


def _redact(s: str) -> str:
    """Redact potential secrets from log strings."""
    # Redact bearer tokens, API keys, long hex strings
    s = re.sub(r"Bearer\s+\S+", "Bearer [REDACTED]", s, flags=re.IGNORECASE)
    s = re.sub(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*\S+", r"\1=[REDACTED]", s)
    s = re.sub(r"\b[a-f0-9]{32,}\b", "[REDACTED_HEX]", s)
    return s


def _debug_log_raw(event_type: str, data_preview: str = "") -> None:
    if _debug:
        logger.info("[DEBUG] Raw Hermes event: type=%s data=%s", event_type, _redact(data_preview[:200]))


def _debug_log_normalized(studio_type: str, payload_preview: str = "") -> None:
    if _debug:
        logger.info("[DEBUG] Normalized Studio event: type=%s payload=%s", studio_type, _redact(payload_preview[:200]))


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _sse_event(
    event_type: str,
    data: dict[str, Any],
    *,
    source: StudioEventSource = "hermes",
    run_id: str | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    return make_studio_event(
        event_type,
        data,
        source=source,
        run_id=run_id,
        session_id=session_id,
    )


def _provider_name(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("id", "name", "provider"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def _normalize_available_model(raw: Any, fallback_provider: str) -> dict[str, str] | None:
    if isinstance(raw, str):
        return {"id": raw, "name": raw, "provider": fallback_provider or "unknown"}
    if not isinstance(raw, dict):
        return None

    model_id = raw.get("id", raw.get("model", raw.get("name")))
    if not isinstance(model_id, str) or not model_id:
        return None

    name = raw.get("name", model_id)
    provider = raw.get("provider", raw.get("provider_id", raw.get("owned_by", fallback_provider)))
    return {
        "id": model_id,
        "name": str(name) if name else model_id,
        "provider": _provider_name(provider) or fallback_provider or "unknown",
    }


def _merge_available_models(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for group in groups:
        for model in group:
            model_id = model.get("id")
            provider = model.get("provider")
            if not isinstance(model_id, str) or not model_id:
                continue
            if not isinstance(provider, str) or not provider:
                provider = "unknown"
            key = (provider, model_id)
            if key in seen:
                continue
            seen.add(key)
            merged.append(model)
    return merged


def _source_from(raw: dict[str, Any]) -> StudioEventSource:
    source = raw.get("source")
    if source == "adapter":
        return "adapter"
    if source == "studio":
        return "studio"
    return "hermes"


_RAW_EVENT_META_KEYS = {"type", "event", "timestamp", "source"}


def _payload_from(raw: dict[str, Any]) -> dict[str, Any]:
    payload = raw.get("payload", raw.get("data"))
    if isinstance(payload, dict):
        return dict(payload)
    if payload is not None:
        return {"value": payload}
    return {k: v for k, v in raw.items() if k not in _RAW_EVENT_META_KEYS}


def _event_type_from(raw: dict[str, Any]) -> str:
    event_type = raw.get("type") or raw.get("event") or ""
    return str(event_type)


def _duration_ms_from(payload: dict[str, Any]) -> int | None:
    duration_ms = payload.get("duration_ms")
    if isinstance(duration_ms, int):
        return duration_ms
    duration = payload.get("duration")
    if isinstance(duration, (int, float)):
        return int(duration * 1000)
    return None


def _total_tokens_from(payload: dict[str, Any]) -> int | None:
    total_tokens = payload.get("total_tokens")
    if isinstance(total_tokens, int):
        return total_tokens
    usage = payload.get("usage")
    if isinstance(usage, dict):
        usage_total_tokens = usage.get("total_tokens")
        if isinstance(usage_total_tokens, int):
            return usage_total_tokens
    return None


def _extract_hermes_error(data: dict[str, Any]) -> str | None:
    error = data.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        if isinstance(message, str) and message:
            code = error.get("code")
            return f"{message} ({code})" if isinstance(code, str) and code else message
    detail = data.get("detail")
    if isinstance(detail, str) and detail:
        return detail
    if isinstance(detail, dict):
        nested = _extract_hermes_error(detail)
        if nested:
            return nested
        message = detail.get("message")
        if isinstance(message, str) and message:
            return message
    message = data.get("message")
    if isinstance(message, str) and message:
        return message
    return None


def _error_message_from_response(resp: httpx.Response, fallback: str) -> str:
    try:
        data = resp.json()
    except Exception:
        return fallback
    if isinstance(data, dict):
        return _extract_hermes_error(data) or fallback
    return fallback


def _capabilities_from_response(data: dict[str, Any]) -> list[str]:
    """Extract stable capability names from verified Hermes capability shapes."""
    capabilities: list[str] = []

    legacy = data.get("capabilities")
    if isinstance(legacy, list):
        capabilities.extend(str(item) for item in legacy if isinstance(item, str))

    features = data.get("features")
    if isinstance(features, dict):
        capabilities.extend(str(key) for key, enabled in features.items() if enabled is True and isinstance(key, str))

    endpoints = data.get("endpoints")
    if isinstance(endpoints, dict):
        capabilities.extend(f"endpoint:{key}" for key in endpoints if isinstance(key, str))

    return sorted(set(capabilities))


async def _fetch_json(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    *,
    timeout: float = 5.0,
) -> dict[str, Any] | None:
    resp = await client.get(url, headers=headers, timeout=timeout)
    if resp.status_code != 200:
        return None
    data = resp.json()
    return data if isinstance(data, dict) else None


def _normalize_hermes_event(raw: dict[str, Any]) -> dict[str, Any]:
    """Convert raw Hermes SSE event into Studio event format.

    Hermes events may have different shapes. This function normalizes them
    into the Studio event schema without leaking Hermes-specific details.
    """
    event_type = _event_type_from(raw)
    payload = _payload_from(raw)
    source = _source_from(raw)
    run_id = payload.get("run_id", raw.get("run_id", ""))
    session_id = payload.get("session_id", raw.get("session_id", ""))

    # Handle OpenAI-compatible delta format
    choices = raw.get("choices")
    if choices and isinstance(choices, list) and len(choices) > 0:
        delta = choices[0].get("delta", {})
        content = delta.get("content")
        if content:
            return _sse_event("assistant.delta", {"text": content}, source=source, run_id=raw.get("run_id"))
        # Check for tool calls
        tool_calls = delta.get("tool_calls")
        if tool_calls and isinstance(tool_calls, list):
            for tc in tool_calls:
                func = tc.get("function", {})
                return _sse_event(
                    "tool.started",
                    {
                        "tool": func.get("name", "unknown"),
                        "tool_call_id": tc.get("id"),
                    },
                    source=source,
                    run_id=raw.get("run_id"),
                )

    # Handle Hermes-specific event types
    if event_type in ("run.started", "run_start", "turn_start"):
        return _sse_event(
            "run.started",
            {
                "run_id": run_id,
                "session_id": session_id,
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("assistant.delta", "message.delta", "text_delta", "content_block_delta"):
        delta = payload.get("delta")
        text = payload.get("text")
        if text is None:
            text = payload.get("content")
        if text is None:
            text = delta.get("text", "") if isinstance(delta, dict) else delta or ""
        if not isinstance(text, str):
            text = str(text)
        return _sse_event("assistant.delta", {"text": text}, source=source, run_id=run_id, session_id=session_id)

    if event_type in ("assistant.completed", "text_done", "content_block_stop"):
        return _sse_event(
            "assistant.completed",
            {
                "model": payload.get("model"),
                "total_tokens": _total_tokens_from(payload),
                "duration_ms": _duration_ms_from(payload),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("tool.started", "tool_start"):
        return _sse_event(
            "tool.started",
            {
                "tool": payload.get("tool", payload.get("name", "unknown")),
                "tool_call_id": payload.get("tool_call_id"),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("tool.progress", "tool_progress"):
        return _sse_event(
            "tool.progress",
            {
                "tool": payload.get("tool", "unknown"),
                "progress": payload.get("progress"),
                "message": payload.get("message"),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("tool.completed", "tool_end", "tool_result"):
        success = payload.get("success")
        if not isinstance(success, bool):
            success = not bool(payload.get("error")) if "error" in payload else True
        return _sse_event(
            "tool.completed",
            {
                "tool": payload.get("tool", payload.get("name", "unknown")),
                "success": success,
                "duration_ms": _duration_ms_from(payload),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("approval.requested",):
        return _sse_event(
            "approval.requested",
            {
                "approval_id": payload.get("approval_id", ""),
                "tool": payload.get("tool", ""),
                "action": payload.get("action", ""),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("approval.resolved",):
        return _sse_event(
            "approval.resolved",
            {
                "approval_id": payload.get("approval_id", ""),
                "decision": payload.get("decision", "approved"),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("run.completed", "run_end", "turn_end"):
        # Check if this is actually a failure
        if payload.get("status") == "failed" or payload.get("error"):
            return _sse_event(
                "run.failed",
                {
                    "run_id": run_id,
                    "message": payload.get("error", payload.get("message", "Run failed")),
                    "error_code": payload.get("error_code"),
                },
                source=source,
                run_id=run_id,
                session_id=session_id,
            )
        return _sse_event(
            "run.completed",
            {
                "run_id": run_id,
                "total_tokens": _total_tokens_from(payload),
                "duration_ms": _duration_ms_from(payload),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("run.failed", "error"):
        return _sse_event(
            "run.failed",
            {
                "run_id": run_id,
                "message": payload.get("message", payload.get("error", "Unknown error")),
                "error_code": payload.get("error_code"),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("run.cancelled",):
        return _sse_event(
            "run.cancelled",
            {
                "run_id": run_id,
                "reason": payload.get("reason", "user_cancelled"),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type == "kanban.updated":
        kanban_payload = normalize_kanban_updated_payload(payload)
        if kanban_payload is None:
            return _sse_event(
                "adapter.warning",
                {
                    "code": "malformed_kanban_updated",
                    "message": "Ignored malformed kanban.updated event",
                    "original_type": event_type,
                },
                source="adapter",
                run_id=run_id,
                session_id=session_id,
            )
        return _sse_event(
            "kanban.updated",
            kanban_payload,
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    # Post-write delta lint results (v0.13.0)
    if event_type in ("lint.result", "post_write_lint"):
        return _sse_event(
            "lint.result",
            {
                "file": payload.get("file", ""),
                "linter": payload.get("linter", ""),
                "issues": payload.get("issues", []),
                "severity": payload.get("severity", "info"),
                "fixable": payload.get("fixable", False),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    # Unknown event — return as adapter.warning
    return _sse_event(
        "adapter.warning",
        {
            "code": "unknown_event",
            "message": f"Unknown Hermes event: {event_type}",
            "original_type": event_type,
        },
        source="adapter",
        run_id=run_id,
        session_id=session_id,
    )


class HermesBackend(StudioBackend):
    """Real Hermes Agent API backend.

    Connects to Hermes API server for run/chat streaming.
    Falls back gracefully if Hermes is unavailable.
    """

    def __init__(self, base_url: str, api_key: str | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._client = httpx.AsyncClient(timeout=30.0)
        self._hermes_healthy = False
        self._last_error: str | None = None
        self._session_repo: SessionRepository | None = None
        self._log_repo: LogRepository | None = None
        self._profile_repo: ProfileRepository | None = None
        self._config_repo: ConfigRepository | None = None
        self._theme_repo: ThemeRepository | None = None
        self._hermes_home = get_hermes_home()
        self._init_repos()

    def _init_repos(self) -> None:
        """Initialize session, log, profile, config, and theme repositories."""
        try:
            # Session repository
            db_path = find_state_db(self._hermes_home)
            if db_path:
                self._session_repo = SessionRepository(db_path)
                logger.info("Session repository initialized: %s", db_path.name)

            # Log repository
            logs_dir = get_hermes_logs_dir()
            if logs_dir:
                self._log_repo = LogRepository(logs_dir)
                logger.info("Log repository initialized: %s", logs_dir.name)

            # Profile repository
            self._profile_repo = ProfileRepository(self._hermes_home)
            logger.info("Profile repository initialized: %d profiles", self._profile_repo.profile_count)

            # Config repository
            self._config_repo = ConfigRepository(self._hermes_home)
            logger.info("Config repository initialized: available=%s", self._config_repo.available)

            # Theme repository
            self._theme_repo = ThemeRepository()
            logger.info("Theme repository initialized: %d themes", len(self._theme_repo.list_themes()))

        except Exception as e:
            logger.warning("Failed to initialize repositories: %s", e)

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    async def _check_hermes(self) -> bool:
        """Check if Hermes API is reachable."""
        try:
            resp = await self._client.get(
                f"{self._base_url}/health",
                headers=self._headers(),
                timeout=5.0,
            )
            self._hermes_healthy = resp.status_code == 200
            self._last_error = None if self._hermes_healthy else _error_message_from_response(resp, f"HTTP {resp.status_code}")
        except Exception as e:
            self._hermes_healthy = False
            self._last_error = str(e)
        return self._hermes_healthy

    async def health(self) -> dict[str, Any]:
        await self._check_hermes()
        log_status = self._log_repo.get_status() if self._log_repo else {"available": False, "reason": "No logs directory found"}
        profile_status = self._profile_repo.get_status() if self._profile_repo else {"available": False, "reason": "No profiles found"}
        return {
            "status": "healthy" if self._hermes_healthy else "degraded",
            "adapter_version": "0.1.0",
            "hermes_connected": self._hermes_healthy,
            "uptime_seconds": 0,
            "backend_mode": "hermes",
            "hermes_url": self._base_url,
            "hermes_last_error": self._last_error,
            "logs": log_status,
            "profiles": profile_status,
            "circuit_breaker": {
                "state": _circuit.state,
                "failure_count": _circuit._failure_count,
            },
        }

    async def bootstrap(self) -> dict[str, Any]:
        await self._check_hermes()

        capabilities: list[str] = []
        if self._hermes_healthy:
            try:
                data = await _fetch_json(
                    self._client,
                    f"{self._base_url}/v1/capabilities",
                    self._headers(),
                    timeout=5.0,
                )
                if data is not None:
                    capabilities = _capabilities_from_response(data)
            except Exception:
                pass

        # Get recent sessions if available
        recent_sessions: list[dict[str, Any]] = []
        session_status: dict[str, Any] = {"source": "unavailable", "available": False}
        if self._session_repo:
            session_status = self._session_repo.get_status()
            if self._session_repo.available:
                session_data = self._session_repo.list_sessions(limit=5)
                recent_sessions = session_data.get("sessions", [])

        active_profile = self._profile_repo.active_profile if self._profile_repo else None
        profile_status = self._profile_repo.get_status() if self._profile_repo else {"available": False}

        # Get logs status
        log_status = self._log_repo.get_status() if self._log_repo else {"available": False}

        # Get model config and local model catalog
        model_config = self._config_repo.get_model_config() if self._config_repo else {"provider": "unknown", "model": "unknown"}
        try:
            from hermes_adapter.hermes_inventory_repository import HermesInventoryRepository

            available_models = HermesInventoryRepository(self._hermes_home).list_models()
        except Exception:
            available_models = []

        # Get display/i18n config
        display_config = self._config_repo.get_display_config() if self._config_repo else {"language": "en"}

        return {
            "adapter_version": "0.1.0",
            "hermes_version": "unknown" if not self._hermes_healthy else "connected",
            "active_profile": active_profile,
            "capabilities": capabilities,
            "recent_sessions": recent_sessions,
            "active_theme": None,
            "available_models": available_models,
            "session_source": session_status,
            "profiles_available": profile_status.get("available", False),
            "profile_count": profile_status.get("profile_count", 0),
            "logs_available": log_status.get("available", False),
            "log_sources": log_status.get("log_files", []),
            "model_config": {
                "provider": model_config.get("provider", "unknown"),
                "model": model_config.get("model", "unknown"),
                "api_key_configured": model_config.get("api_key_configured", False),
                "config_source": model_config.get("config_source", "unavailable"),
            },
            "display": display_config,
        }

    async def list_profiles(self) -> list[dict[str, Any]]:
        if self._profile_repo:
            return self._profile_repo.list_profiles()
        return []

    async def get_active_profile(self) -> dict[str, Any] | None:
        if self._profile_repo:
            return self._profile_repo.get_active_profile()
        return None

    async def activate_profile(self, profile_id: str) -> dict[str, Any]:
        """Activate a profile via Hermes CLI or API."""
        if not profile_id or not profile_id.strip():
            raise ValueError("profile_id is required")
        clean_id = profile_id.strip()

        # Try API first
        if self._hermes_healthy:
            try:
                resp = await self._client.post(
                    f"{self._base_url}/v1/profiles/{clean_id}/activate",
                    headers=self._headers(),
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    data = resp.json() if isinstance(resp.json(), dict) else {}
                    return {"status": "activated", "profile": clean_id, **data}
                if resp.status_code != 404:
                    message = _error_message_from_response(resp, f"Activation failed: {resp.status_code}")
                    raise ValueError(message)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 404:
                    message = _error_message_from_response(exc.response, str(exc))
                    raise ValueError(message) from exc
            except httpx.ConnectError:
                pass  # Fall through to CLI

        # Fallback: CLI
        try:
            result = subprocess.run(
                ["hermes", "profile", "use", clean_id],
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode == 0:
                self._profile_repo = ProfileRepository(self._hermes_home)
                return {"status": "activated", "profile": clean_id, "source": "cli"}
            raise ValueError(result.stderr.strip() or f"CLI exit code {result.returncode}")
        except FileNotFoundError as exc:
            raise ValueError("Hermes CLI not found on PATH; profile activation unavailable") from exc
        except subprocess.TimeoutExpired as exc:
            raise ValueError("Hermes CLI timed out") from exc

    async def respond_to_approval(self, approval_id: str, decision: str) -> dict[str, Any]:
        """Respond to an approval request via Hermes API and update local state."""
        from hermes_adapter.approval_repository import ApprovalRepository

        if decision not in ("approved", "denied"):
            raise ValueError("decision must be 'approved' or 'denied'")

        if not approval_id or not approval_id.strip():
            raise ValueError("approval_id is required")

        # Try calling Hermes API
        hermes_success = False
        if self._hermes_healthy:
            try:
                resp = await self._client.post(
                    f"{self._base_url}/v1/approvals/{approval_id}/respond",
                    headers={**self._headers(), "Content-Type": "application/json"},
                    json={"decision": decision},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    hermes_success = True
                elif resp.status_code != 404:
                    message = _error_message_from_response(resp, f"Hermes responded {resp.status_code}")
                    raise ValueError(message)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 404:
                    raise ValueError(_error_message_from_response(exc.response, str(exc))) from exc
            except httpx.ConnectError:
                logger.warning("Hermes unreachable for approval response; recording locally")

        # Record decision locally
        repo = ApprovalRepository()
        approval = repo.update_local_decision(approval_id, decision)

        return {
            "status": "responded",
            "approval_id": approval_id,
            "decision": decision,
            "hermes_notified": hermes_success,
            "approval": approval,
        }

    async def list_sessions(self) -> dict[str, Any]:
        if self._session_repo and self._session_repo.available:
            return self._session_repo.list_sessions()
        return {"sessions": [], "total": 0, "source": "unavailable", "reason": "No Hermes state.db found"}

    async def get_session(self, session_id: str) -> dict[str, Any]:
        if self._session_repo and self._session_repo.available:
            session = self._session_repo.get_session(session_id)
            if session:
                return session
        raise ValueError(f"Session '{session_id}' not found")

    def _session_key_header(self) -> dict[str, str]:
        """Return X-Hermes-Session-Key header if configured."""
        key = os.environ.get("HERMES_SESSION_KEY", "").strip()
        if key:
            return {"X-Hermes-Session-Key": key}
        return {}

    async def start_run(
        self,
        session_id: str,
        prompt: str,
        profile: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not await self._check_hermes():
            return {"run_id": "", "status": "failed", "error": f"Hermes not reachable: {self._last_error}"}

        def _run_options() -> dict[str, Any]:
            if not isinstance(context, dict):
                return {}
            options: dict[str, Any] = {}
            for source_key, target_key in (
                ("workspace_path", "workspace_path"),
                ("mode", "mode"),
                ("run_mode", "mode"),
                ("model", "model"),
                ("provider", "provider"),
                ("skills", "skills"),
                ("toolsets", "toolsets"),
                ("checkpoints", "checkpoints"),
                ("max_turns", "max_turns"),
                ("worktree", "worktree"),
                ("pass_session_id", "pass_session_id"),
                ("ignore_rules", "ignore_rules"),
                ("ignore_user_config", "ignore_user_config"),
                ("linked_card_id", "linked_card_id"),
            ):
                value = context.get(source_key)
                if value not in (None, "", [], {}):
                    options[target_key] = value
            return options

        async def _do_start(include_options: bool = True) -> dict[str, Any]:
            payload: dict[str, Any] = {
                "session_id": session_id,
                "input": prompt,
            }
            if profile:
                payload["profile"] = profile
            if include_options:
                payload.update(_run_options())
            resp = await self._client.post(
                f"{self._base_url}/v1/runs",
                headers={
                    **self._headers(),
                    **self._session_key_header(),
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=10.0,
            )
            if include_options and resp.status_code in {400, 422} and len(payload) > 2:
                logger.warning("Hermes rejected Studio run options; retrying with minimal run payload")
                return await _do_start(include_options=False)
            resp.raise_for_status()
            data = resp.json()
            return {
                "run_id": data.get("run_id", str(uuid.uuid4())),
                "status": data.get("status", "started"),
            }

        try:
            result = await _retry_with_backoff(_do_start)
            _circuit.record_success()
            return result
        except httpx.HTTPStatusError as e:
            _circuit.record_failure()
            message = _error_message_from_response(e.response, f"Hermes API error: {e.response.status_code}")
            return {"run_id": "", "status": "failed", "error": message}
        except Exception as e:
            _circuit.record_failure()
            return {"run_id": "", "status": "failed", "error": str(e)}

    async def stream_run_events(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
        """Proxy Hermes SSE stream and normalize events into Studio format."""
        if not self._hermes_healthy:
            yield _sse_event(
                "run.failed",
                {"run_id": run_id, "message": "Hermes not reachable"},
                source="adapter",
                run_id=run_id,
            )
            return

        url = f"{self._base_url}/v1/runs/{run_id}/events"
        try:
            async with self._client.stream(
                "GET",
                url,
                headers=self._headers(),
                timeout=None,
            ) as resp:
                if resp.status_code != 200:
                    fallback = f"Hermes SSE returned {resp.status_code}"
                    try:
                        body = await resp.aread()
                        data = json.loads(body.decode("utf-8"))
                        if isinstance(data, dict):
                            fallback = _extract_hermes_error(data) or fallback
                    except Exception:
                        pass
                    yield _sse_event(
                        "run.failed",
                        {
                            "run_id": run_id,
                            "message": fallback,
                        },
                        source="adapter",
                        run_id=run_id,
                    )
                    return

                buffer = ""
                async for chunk in resp.aiter_text():
                    buffer += chunk
                    while "\n\n" in buffer:
                        block, buffer = buffer.split("\n\n", 1)
                        event_type = ""
                        data_lines = []
                        for line in block.split("\n"):
                            if line.startswith("event: "):
                                event_type = line[7:].strip()
                            elif line.startswith("data: "):
                                data_lines.append(line[6:])
                        data_str = "\n".join(data_lines)

                        if not data_str:
                            continue

                        # Handle [DONE] signal
                        if data_str.strip() == "[DONE]":
                            yield _sse_event("run.completed", {"run_id": run_id}, run_id=run_id)
                            return

                        try:
                            raw_event = json.loads(data_str)
                            # If no explicit type, infer from content
                            if not event_type:
                                if "choices" in raw_event:
                                    delta = raw_event.get("choices", [{}])[0].get("delta", {})
                                    if delta.get("content"):
                                        text = delta["content"]
                                        _debug_log_raw("openai_delta", text)
                                        studio_event = _sse_event(
                                            "assistant.delta",
                                            {"text": text},
                                            run_id=run_id,
                                        )
                                        _debug_log_normalized("assistant.delta", json.dumps({"text": text})[:100])
                                        yield studio_event
                                        continue
                                event_type = raw_event.get("type") or raw_event.get("event") or "unknown"

                            event_type = str(event_type)
                            raw_event["type"] = event_type
                            _debug_log_raw(event_type, data_str)
                            normalized = _normalize_hermes_event(raw_event)
                            _debug_log_normalized(normalized["type"], json.dumps(normalized.get("payload", {}))[:100])
                            yield normalized

                            # Stop on terminal events
                            if normalized["type"] in ("run.completed", "run.failed", "run.cancelled"):
                                return
                        except json.JSONDecodeError:
                            continue

        except httpx.ReadTimeout:
            yield _sse_event(
                "adapter.warning",
                {
                    "code": "hermes_timeout",
                    "message": "Hermes SSE stream timed out",
                },
                source="adapter",
                run_id=run_id,
            )
        except httpx.RemoteProtocolError:
            yield _sse_event(
                "run.failed",
                {
                    "run_id": run_id,
                    "message": "Hermes SSE stream disconnected unexpectedly",
                },
                source="adapter",
                run_id=run_id,
            )
        except Exception as e:
            yield _sse_event(
                "run.failed",
                {
                    "run_id": run_id,
                    "message": f"Hermes SSE error: {e}",
                },
                source="adapter",
                run_id=run_id,
            )

    async def stop_run(self, run_id: str) -> dict[str, Any]:
        if not self._hermes_healthy:
            return {"run_id": run_id, "status": "failed", "error": "Hermes not reachable"}

        try:
            resp = await self._client.post(
                f"{self._base_url}/v1/runs/{run_id}/stop",
                headers=self._headers(),
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                status = data.get("status", "stopping") if isinstance(data, dict) else "stopping"
                return {"run_id": run_id, "status": status}
            message = _error_message_from_response(resp, f"Stop returned {resp.status_code}")
            return {"run_id": run_id, "status": "failed", "error": message}
        except Exception as e:
            return {"run_id": run_id, "status": "failed", "error": str(e)}

    async def get_logs(self, source: str | None = None, tail: int = 100) -> dict[str, Any]:
        if self._log_repo and self._log_repo.available:
            return self._log_repo.get_recent_logs(source=source, tail=tail)
        return {"source": source or "unknown", "lines": [], "total": 0, "reason": "No Hermes logs directory found"}

    async def stream_logs(self, source: str | None = None) -> AsyncIterator[dict[str, Any]]:
        if not self._log_repo or not self._log_repo.available:
            yield _sse_event(
                "log.line",
                {
                    "source": "adapter",
                    "level": "info",
                    "message": "Hermes logs not available",
                    "timestamp": _now_iso(),
                },
                source="adapter",
            )
            return

        log_files = self._log_repo.log_files
        target = source if source and source in log_files else (log_files[0] if log_files else None)
        if not target:
            yield _sse_event(
                "log.line",
                {
                    "source": "adapter",
                    "level": "info",
                    "message": "No log files found",
                    "timestamp": _now_iso(),
                },
                source="adapter",
            )
            return

        log_path = self._log_repo._logs_dir / target
        from hermes_adapter.log_repository import LogStreamer
        streamer = LogStreamer(log_path)
        async for line in streamer.stream():
            yield _sse_event(
                "log.line",
                {"source": target, "level": "info", "message": line, "timestamp": _now_iso()},
                source="adapter",
            )

    async def list_themes(self) -> dict[str, Any]:
        if self._theme_repo:
            themes = self._theme_repo.list_themes()
            active = self._theme_repo.get_active_theme_id()
            return {"themes": themes, "active": active}
        return {"themes": [], "active": ""}

    async def get_theme(self, theme_id: str) -> dict[str, Any]:
        if self._theme_repo:
            return self._theme_repo.get_normalized_theme(theme_id)
        raise ValueError(f"Theme '{theme_id}' not found")

    async def get_active_theme(self) -> dict[str, Any]:
        if self._theme_repo:
            return self._theme_repo.get_normalized_theme(self._theme_repo.get_active_theme_id())
        return {}

    async def activate_theme(self, theme_id: str) -> dict[str, Any]:
        if self._theme_repo:
            return self._theme_repo.activate_theme(theme_id)
        raise ValueError("Theme system not available")

    async def reload_themes(self) -> dict[str, Any]:
        if self._theme_repo:
            self._theme_repo.reload()
            return {"reloaded": True, "count": len(self._theme_repo.list_themes())}
        return {"reloaded": False, "count": 0}

    async def get_config(self) -> dict[str, Any]:
        return {"config": {"backend_mode": "hermes", "hermes_url": self._base_url}}

    async def patch_config(self, key: str, value: Any) -> dict[str, Any]:
        if not isinstance(key, str) or not key.strip():
            raise ValueError("Config key is required")
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,96}", key):
            raise ValueError("Config key contains unsupported characters")
        if value is None or isinstance(value, (dict, list)):
            raise ValueError("Config value must be a scalar")
        value_text = str(value)
        if "\x00" in value_text or len(value_text) > 1000:
            raise ValueError("Config value is invalid")

        await self._run_hermes_cli(["config", "set", key.strip(), value_text], timeout=20.0)
        self._config_repo = ConfigRepository(self._hermes_home)
        return await self.get_config()

    async def patch_model_config(self, updates: dict[str, Any]) -> dict[str, Any]:
        allowed_keys = {"provider", "model", "base_url", "temperature", "max_tokens", "context_window"}
        unknown_keys = sorted(set(updates) - allowed_keys)
        if unknown_keys:
            raise ValueError(f"Unsupported model config keys: {', '.join(unknown_keys)}")

        key_map = {
            "provider": "model.provider",
            "model": "model.default",
            "base_url": "model.base_url",
            "temperature": "model.temperature",
            "max_tokens": "model.max_tokens",
            "context_window": "model.context_window",
        }
        applied: list[str] = []
        for key in ("provider", "model", "base_url", "temperature", "max_tokens", "context_window"):
            if key not in updates:
                continue
            value = updates[key]
            if value in (None, ""):
                continue
            if key in {"provider", "model", "base_url"} and not isinstance(value, str):
                raise ValueError(f"{key} must be a string")
            if key in {"temperature", "max_tokens", "context_window"} and not isinstance(value, (int, float)):
                raise ValueError(f"{key} must be numeric")
            await self._run_hermes_cli(["config", "set", key_map[key], str(value)], timeout=20.0)
            applied.append(key)

        if not applied:
            raise ValueError("No supported model config updates were provided")

        self._config_repo = ConfigRepository(self._hermes_home)
        config = await self.get_model_config()
        config["status"] = "updated"
        config["updated_fields"] = applied
        config["write_source"] = "hermes_cli"
        return config

    async def _run_hermes_cli(self, args: list[str], *, timeout: float = 30.0) -> subprocess.CompletedProcess[str]:
        """Run an official Hermes CLI command against this Hermes home."""
        env = {**os.environ, "HERMES_HOME": str(self._hermes_home)}

        def _run() -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                ["hermes", *args],
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
                env=env,
            )

        try:
            result = await asyncio.to_thread(_run)
        except FileNotFoundError as exc:
            raise ValueError("Hermes CLI not found on PATH") from exc
        except subprocess.TimeoutExpired as exc:
            raise ValueError("Hermes CLI timed out") from exc

        if result.returncode != 0:
            message = (result.stderr or result.stdout or f"Hermes CLI exited with {result.returncode}").strip()
            raise ValueError(_redact(message))
        return result

    async def get_model_config(self) -> dict[str, Any]:
        """Return model/provider config from config.yaml + .env + Hermes API."""
        base_config = self._config_repo.get_model_config() if self._config_repo else {
            "provider": "unknown",
            "model": "unknown",
            "api_key_configured": False,
            "config_source": "unavailable",
            "warnings": ["No config repository"],
        }

        # Try to enrich with Hermes API data
        capabilities: list[str] = []
        available_models: list[dict[str, Any]] = []
        await self._check_hermes()
        if self._hermes_healthy:
            try:
                data = await _fetch_json(
                    self._client,
                    f"{self._base_url}/v1/capabilities",
                    self._headers(),
                    timeout=5.0,
                )
                if data is not None:
                    capabilities = _capabilities_from_response(data)
            except Exception:
                pass
            try:
                data = await _fetch_json(
                    self._client,
                    f"{self._base_url}/v1/models",
                    self._headers(),
                    timeout=5.0,
                )
                if data is not None:
                    models = data.get("data", data.get("models", []))
                    if isinstance(models, list):
                        provider = str(base_config.get("provider") or "unknown")
                        available_models = [
                            normalized
                            for raw_model in models
                            if (normalized := _normalize_available_model(raw_model, provider))
                        ]
            except Exception:
                pass

        if not available_models:
            config_models = base_config.get("available_models", [])
            if isinstance(config_models, list):
                provider = str(base_config.get("provider") or "unknown")
                available_models = [
                    normalized
                    for raw_model in config_models
                    if (normalized := _normalize_available_model(raw_model, provider))
                ]

        try:
            from hermes_adapter.hermes_inventory_repository import HermesInventoryRepository

            local_models = HermesInventoryRepository(self._hermes_home).list_models()
        except Exception as exc:
            warnings = base_config.get("warnings")
            if isinstance(warnings, list):
                warnings.append(f"Local Hermes model inventory unavailable: {exc}")
        else:
            available_models = _merge_available_models(available_models, local_models)

        base_config["capabilities_available"] = len(capabilities) > 0
        base_config["capabilities"] = capabilities
        base_config["available_models"] = available_models
        base_config["available_model_count"] = len(available_models)
        return base_config

    async def close(self) -> None:
        await self._client.aclose()
