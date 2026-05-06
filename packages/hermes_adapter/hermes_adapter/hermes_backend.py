"""Hermes backend — real Hermes Agent API integration."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import httpx

from hermes_adapter.backend_base import StudioBackend
from hermes_adapter.backend_config import get_debug_events
from hermes_adapter.log_repository import LogRepository, get_hermes_logs_dir
from hermes_adapter.profile_repository import ProfileRepository
from hermes_adapter.session_repository import SessionRepository, find_state_db, get_hermes_home

logger = logging.getLogger("hermes_adapter.hermes_backend")
_debug = get_debug_events()


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
    return datetime.now(timezone.utc).isoformat()


def _sse_event(event_type: str, data: Any) -> dict[str, Any]:
    return {"type": event_type, "payload": data}


def _normalize_hermes_event(raw: dict[str, Any]) -> dict[str, Any]:
    """Convert raw Hermes SSE event into Studio event format.

    Hermes events may have different shapes. This function normalizes them
    into the Studio event schema without leaking Hermes-specific details.
    """
    event_type = raw.get("type", "")
    payload = raw.get("payload", raw.get("data", {}))

    # Handle OpenAI-compatible delta format
    choices = raw.get("choices")
    if choices and isinstance(choices, list) and len(choices) > 0:
        delta = choices[0].get("delta", {})
        content = delta.get("content")
        if content:
            return _sse_event("assistant.delta", {"text": content})
        # Check for tool calls
        tool_calls = delta.get("tool_calls")
        if tool_calls and isinstance(tool_calls, list):
            for tc in tool_calls:
                func = tc.get("function", {})
                return _sse_event("tool.started", {
                    "tool": func.get("name", "unknown"),
                    "tool_call_id": tc.get("id"),
                })

    # Handle Hermes-specific event types
    if event_type in ("run.started", "run_start", "turn_start"):
        return _sse_event("run.started", {
            "run_id": payload.get("run_id", raw.get("run_id", "")),
            "session_id": payload.get("session_id", raw.get("session_id", "")),
        })

    if event_type in ("assistant.delta", "text_delta", "content_block_delta"):
        text = payload.get("text", payload.get("delta", {}).get("text", ""))
        return _sse_event("assistant.delta", {"text": text})

    if event_type in ("assistant.completed", "text_done", "content_block_stop"):
        return _sse_event("assistant.completed", {
            "model": payload.get("model"),
            "total_tokens": payload.get("total_tokens"),
            "duration_ms": payload.get("duration_ms"),
        })

    if event_type in ("tool.started", "tool_start"):
        return _sse_event("tool.started", {
            "tool": payload.get("tool", payload.get("name", "unknown")),
            "tool_call_id": payload.get("tool_call_id"),
        })

    if event_type in ("tool.progress", "tool_progress"):
        return _sse_event("tool.progress", {
            "tool": payload.get("tool", "unknown"),
            "progress": payload.get("progress"),
            "message": payload.get("message"),
        })

    if event_type in ("tool.completed", "tool_end", "tool_result"):
        return _sse_event("tool.completed", {
            "tool": payload.get("tool", payload.get("name", "unknown")),
            "success": payload.get("success", True),
            "duration_ms": payload.get("duration_ms"),
        })

    if event_type in ("approval.requested",):
        return _sse_event("approval.requested", {
            "approval_id": payload.get("approval_id", ""),
            "tool": payload.get("tool", ""),
            "action": payload.get("action", ""),
        })

    if event_type in ("approval.resolved",):
        return _sse_event("approval.resolved", {
            "approval_id": payload.get("approval_id", ""),
            "decision": payload.get("decision", "approved"),
        })

    if event_type in ("run.completed", "run_end", "turn_end"):
        # Check if this is actually a failure
        if payload.get("status") == "failed" or payload.get("error"):
            return _sse_event("run.failed", {
                "run_id": payload.get("run_id", raw.get("run_id", "")),
                "message": payload.get("error", payload.get("message", "Run failed")),
                "error_code": payload.get("error_code"),
            })
        return _sse_event("run.completed", {
            "run_id": payload.get("run_id", raw.get("run_id", "")),
            "total_tokens": payload.get("total_tokens"),
            "duration_ms": payload.get("duration_ms"),
        })

    if event_type in ("run.failed", "error"):
        return _sse_event("run.failed", {
            "run_id": payload.get("run_id", raw.get("run_id", "")),
            "message": payload.get("message", payload.get("error", "Unknown error")),
            "error_code": payload.get("error_code"),
        })

    if event_type in ("run.cancelled",):
        return _sse_event("run.cancelled", {
            "run_id": payload.get("run_id", raw.get("run_id", "")),
            "reason": payload.get("reason", "user_cancelled"),
        })

    # Unknown event — return as adapter.warning
    return _sse_event("adapter.warning", {
        "code": "unknown_event",
        "message": f"Unknown Hermes event: {event_type}",
        "original_type": event_type,
    })


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
        self._hermes_home = get_hermes_home()
        self._init_repos()

    def _init_repos(self) -> None:
        """Initialize session, log, and profile repositories."""
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
            self._last_error = None
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
        }

    async def bootstrap(self) -> dict[str, Any]:
        await self._check_hermes()

        capabilities: list[str] = []
        if self._hermes_healthy:
            try:
                resp = await self._client.get(
                    f"{self._base_url}/v1/capabilities",
                    headers=self._headers(),
                    timeout=5.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    capabilities = data.get("capabilities", [])
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

        # Get profiles
        profiles = self._profile_repo.list_profiles() if self._profile_repo else []
        active_profile = self._profile_repo.active_profile if self._profile_repo else None
        profile_status = self._profile_repo.get_status() if self._profile_repo else {"available": False}

        # Get logs status
        log_status = self._log_repo.get_status() if self._log_repo else {"available": False}

        return {
            "adapter_version": "0.1.0",
            "hermes_version": "unknown" if not self._hermes_healthy else "connected",
            "active_profile": active_profile,
            "capabilities": capabilities or ["chat", "tools", "streaming"],
            "recent_sessions": recent_sessions,
            "active_theme": None,
            "available_models": [],
            "session_source": session_status,
            "profiles_available": profile_status.get("available", False),
            "profile_count": profile_status.get("profile_count", 0),
            "logs_available": log_status.get("available", False),
            "log_sources": log_status.get("log_files", []),
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
        return {"status": "not_implemented", "message": "Profile switching not yet implemented"}

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

    async def start_run(self, session_id: str, prompt: str, profile: str | None = None) -> dict[str, Any]:
        if not await self._check_hermes():
            return {"run_id": "", "status": "failed", "error": f"Hermes not reachable: {self._last_error}"}

        try:
            payload: dict[str, Any] = {
                "session_id": session_id,
                "prompt": prompt,
            }
            if profile:
                payload["profile"] = profile

            resp = await self._client.post(
                f"{self._base_url}/v1/runs",
                headers={**self._headers(), "Content-Type": "application/json"},
                json=payload,
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "run_id": data.get("run_id", str(uuid.uuid4())),
                "status": "started",
            }
        except httpx.HTTPStatusError as e:
            return {"run_id": "", "status": "failed", "error": f"Hermes API error: {e.response.status_code}"}
        except Exception as e:
            return {"run_id": "", "status": "failed", "error": str(e)}

    async def stream_run_events(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
        """Proxy Hermes SSE stream and normalize events into Studio format."""
        if not self._hermes_healthy:
            yield _sse_event("run.failed", {"run_id": run_id, "message": "Hermes not reachable"})
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
                    yield _sse_event("run.failed", {
                        "run_id": run_id,
                        "message": f"Hermes SSE returned {resp.status_code}",
                    })
                    return

                buffer = ""
                async for chunk in resp.aiter_text():
                    buffer += chunk
                    while "\n\n" in buffer:
                        block, buffer = buffer.split("\n\n", 1)
                        event_type = ""
                        data_str = ""
                        for line in block.split("\n"):
                            if line.startswith("event: "):
                                event_type = line[7:].strip()
                            elif line.startswith("data: "):
                                data_str = line[6:]

                        if not data_str:
                            continue

                        # Handle [DONE] signal
                        if data_str.strip() == "[DONE]":
                            yield _sse_event("run.completed", {"run_id": run_id})
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
                                        studio_event = _sse_event("assistant.delta", {"text": text})
                                        _debug_log_normalized("assistant.delta", json.dumps({"text": text})[:100])
                                        yield studio_event
                                        continue
                                event_type = raw_event.get("type", "unknown")

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
            yield _sse_event("adapter.warning", {
                "code": "hermes_timeout",
                "message": "Hermes SSE stream timed out",
            })
        except httpx.RemoteProtocolError:
            yield _sse_event("run.failed", {
                "run_id": run_id,
                "message": "Hermes SSE stream disconnected unexpectedly",
            })
        except Exception as e:
            yield _sse_event("run.failed", {
                "run_id": run_id,
                "message": f"Hermes SSE error: {e}",
            })

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
                return {"run_id": run_id, "status": "cancelled"}
            return {"run_id": run_id, "status": "failed", "error": f"Stop returned {resp.status_code}"}
        except Exception as e:
            return {"run_id": run_id, "status": "failed", "error": str(e)}

    async def get_logs(self, source: str | None = None, tail: int = 100) -> dict[str, Any]:
        if self._log_repo and self._log_repo.available:
            return self._log_repo.get_recent_logs(source=source, tail=tail)
        return {"source": source or "unknown", "lines": [], "total": 0, "reason": "No Hermes logs directory found"}

    async def stream_logs(self, source: str | None = None) -> AsyncIterator[dict[str, Any]]:
        if not self._log_repo or not self._log_repo.available:
            yield _sse_event("log.line", {"source": "adapter", "level": "info", "message": "Hermes logs not available", "timestamp": _now_iso()})
            return

        log_files = self._log_repo.log_files
        target = source if source and source in log_files else (log_files[0] if log_files else None)
        if not target:
            yield _sse_event("log.line", {"source": "adapter", "level": "info", "message": "No log files found", "timestamp": _now_iso()})
            return

        log_path = self._log_repo._logs_dir / target
        from hermes_adapter.log_repository import LogStreamer
        streamer = LogStreamer(log_path)
        async for line in streamer.stream():
            yield _sse_event("log.line", {"source": target, "level": "info", "message": line, "timestamp": _now_iso()})

    async def list_themes(self) -> dict[str, Any]:
        return {"themes": [], "active": ""}

    async def activate_theme(self, theme_id: str) -> dict[str, Any]:
        raise ValueError("Theme activation not supported in Hermes backend mode")

    async def get_config(self) -> dict[str, Any]:
        return {"config": {"backend_mode": "hermes", "hermes_url": self._base_url}}

    async def patch_config(self, key: str, value: Any) -> dict[str, Any]:
        raise ValueError("Config mutation not supported in Hermes backend mode")

    async def close(self) -> None:
        await self._client.aclose()
