"""Mock backend — fake in-memory data for development."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

from hermes_adapter.backend_base import StudioBackend
from hermes_adapter.studio_events import make_studio_event
from hermes_adapter.theme_repository import ThemeRepository


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _sse_event(event_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """Format as a complete Studio event dict."""
    return make_studio_event(event_type, data, source="adapter")


class MockBackend(StudioBackend):
    """Fake backend with in-memory data. No real Hermes connection."""

    def __init__(self) -> None:
        self._active_runs: dict[str, dict[str, Any]] = {}
        self._run_cancelled: set[str] = set()
        self._theme_repo = ThemeRepository()

    async def health(self) -> dict[str, Any]:
        return {
            "status": "healthy",
            "adapter_version": "0.1.0",
            "hermes_connected": False,
            "uptime_seconds": 0,
            "backend_mode": "mock",
        }

    async def bootstrap(self) -> dict[str, Any]:
        return {
            "adapter_version": "0.1.0",
            "hermes_version": "0.12.0-mock",
            "active_profile": "coder",
            "capabilities": ["chat", "tools", "files", "approval", "streaming"],
            "recent_sessions": self._sessions(),
            "active_theme": self._theme_repo.get_theme_info(self._theme_repo.get_active_theme_id()),
            "available_models": [
                {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "provider": "Anthropic"},
                {"id": "gpt-4o", "name": "GPT-4o", "provider": "OpenAI"},
            ],
            "display": {"language": "en", "timezone": None, "theme": None},
        }

    async def list_profiles(self) -> list[dict[str, Any]]:
        return [
            {"name": "coder", "path": "~/.hermes-profiles/coder"},
            {"name": "research", "path": "~/.hermes-profiles/research"},
            {"name": "writer", "path": "~/.hermes-profiles/writer"},
        ]

    async def get_active_profile(self) -> dict[str, Any] | None:
        return {"name": "coder", "path": "~/.hermes-profiles/coder", "active": True}

    async def respond_to_approval(self, approval_id: str, decision: str) -> dict[str, Any]:
        """Mock approval response."""
        from hermes_adapter.approval_repository import ApprovalRepository
        if decision not in ("approved", "denied"):
            raise ValueError("decision must be 'approved' or 'denied'")
        repo = ApprovalRepository()
        approval = repo.update_local_decision(approval_id, decision)
        return {
            "status": "responded",
            "approval_id": approval_id,
            "decision": decision,
            "hermes_notified": True,
            "approval": approval,
        }

    async def list_sessions(self) -> dict[str, Any]:
        sessions = self._sessions()
        return {"sessions": sessions, "total": len(sessions)}

    async def get_session(self, session_id: str) -> dict[str, Any]:
        for s in self._sessions():
            if s["id"] == session_id:
                return {
                    **s,
                    "transcript_preview": [
                        {"role": "user", "content": "Can you map the src directory structure?"},
                        {"role": "assistant", "content": "I'll explore the src directory structure for you."},
                    ],
                }
        raise ValueError(f"Session '{session_id}' not found")

    async def start_run(self, session_id: str, prompt: str, profile: str | None = None) -> dict[str, Any]:
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        self._active_runs[run_id] = {
            "run_id": run_id,
            "session_id": session_id,
            "prompt": prompt,
            "status": "started",
            "created_at": _now_iso(),
        }
        return {"run_id": run_id, "status": "started"}

    async def stream_run_events(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
        run = self._active_runs.get(run_id)
        if not run:
            yield _sse_event("run.failed", {"run_id": run_id, "message": f"Run '{run_id}' not found", "error_code": "not_found"})
            return

        response_chunks = [
            "Let me work on that for you. ",
            "I'll analyze the request and ",
            "provide a detailed response ",
            "based on the current context.",
        ]

        if run_id in self._run_cancelled:
            yield _sse_event("run.cancelled", {"run_id": run_id, "reason": "user_cancelled"})
            return
        yield _sse_event("run.started", {"run_id": run_id, "session_id": run["session_id"]})
        await asyncio.sleep(0.3)

        for chunk in response_chunks:
            if run_id in self._run_cancelled:
                yield _sse_event("run.cancelled", {"run_id": run_id, "reason": "user_cancelled"})
                self._run_cancelled.discard(run_id)
                return
            yield _sse_event("assistant.delta", {"text": chunk})
            await asyncio.sleep(0.2)

        if run_id in self._run_cancelled:
            yield _sse_event("run.cancelled", {"run_id": run_id, "reason": "user_cancelled"})
            return
        yield _sse_event("tool.started", {"tool": "file_tree", "tool_call_id": "tc_001"})
        await asyncio.sleep(0.3)

        for pct in (30, 70, 100):
            if run_id in self._run_cancelled:
                yield _sse_event("run.cancelled", {"run_id": run_id, "reason": "user_cancelled"})
                return
            yield _sse_event("tool.progress", {"tool": "file_tree", "tool_call_id": "tc_001", "progress": pct / 100, "message": f"Scanning... {pct}%"})
            await asyncio.sleep(0.2)

        if run_id in self._run_cancelled:
            yield _sse_event("run.cancelled", {"run_id": run_id, "reason": "user_cancelled"})
            return
        yield _sse_event("tool.completed", {"tool": "file_tree", "tool_call_id": "tc_001", "success": True, "duration_ms": 1200, "output": ["src/", "tests/", "README.md"]})
        await asyncio.sleep(0.3)

        yield _sse_event("assistant.completed", {"model": "claude-sonnet-4-20250514", "total_tokens": 342, "duration_ms": 2100})
        await asyncio.sleep(0.2)

        yield _sse_event("kanban.updated", {"board_id": "board_default", "action": "card_status_changed", "card_id": "card_mock_2"})
        await asyncio.sleep(0.1)

        yield _sse_event("memory.updated", {"session_id": run["session_id"], "action": "created", "artifact_id": "mem_new_001"})
        await asyncio.sleep(0.1)

        yield _sse_event("run.completed", {"run_id": run_id, "total_tokens": 342, "duration_ms": 2100, "tool_count": 1})

        self._active_runs.pop(run_id, None)
        self._run_cancelled.discard(run_id)

    async def stop_run(self, run_id: str) -> dict[str, Any]:
        if run_id in self._active_runs:
            self._run_cancelled.add(run_id)
            self._active_runs[run_id]["status"] = "cancelled"
            return {"run_id": run_id, "status": "cancelled"}
        return {"run_id": run_id, "status": "not_found"}

    async def get_logs(self, source: str | None = None, tail: int = 100) -> dict[str, Any]:
        lines = [
            "[10:05:32] [INFO] Adapter started on 127.0.0.1:39191",
            "[10:05:33] [INFO] Studio endpoints registered",
            "[10:05:33] [INFO] Theme loader initialized: 5 themes found",
            "[10:05:34] [INFO] Hermes health check: OK (mock v0.12.0)",
            "[10:06:01] [INFO] Run started: run_abc123",
            "[10:06:02] [INFO] Tool started: file_tree",
            "[10:06:03] [INFO] Tool completed: file_tree (1.2s)",
            "[10:06:15] [INFO] Run completed: run_abc123",
            "[10:08:00] [WARN] Theme minecraft-overworld: missing accessibility.font_scale",
            "[10:10:45] [INFO] Session s-2 resumed",
        ]
        return {"source": source or "agent.log", "lines": lines[-tail:], "total": len(lines)}

    async def stream_logs(self, source: str | None = None) -> AsyncIterator[dict[str, Any]]:
        messages = [
            ("info", "Heartbeat: adapter alive"),
            ("info", "Memory usage: 42MB"),
            ("info", "Active sessions: 1"),
            ("warn", "Theme cache expired, refreshing..."),
            ("info", "Theme cache refreshed"),
            ("info", "Hermes API check: healthy (mock)"),
            ("info", "Idle timeout: no active runs"),
            ("info", "Session s-1 updated: 13 messages"),
            ("info", "Tool registry: 4 tools available"),
            ("info", "Config watcher: no changes detected"),
        ]
        idx = 0
        while True:
            level, msg = messages[idx % len(messages)]
            yield _sse_event("log.line", {"source": "agent", "level": level, "message": msg, "timestamp": _now_iso()})
            idx += 1
            try:
                await asyncio.sleep(1.5)
            except asyncio.CancelledError:
                return

    async def list_themes(self) -> dict[str, Any]:
        return {
            "themes": self._theme_repo.list_themes(),
            "active": self._theme_repo.get_active_theme_id(),
        }

    async def get_theme(self, theme_id: str) -> dict[str, Any]:
        return self._theme_repo.get_normalized_theme(theme_id)

    async def get_active_theme(self) -> dict[str, Any]:
        return self._theme_repo.get_normalized_theme(self._theme_repo.get_active_theme_id())

    async def activate_theme(self, theme_id: str) -> dict[str, Any]:
        return self._theme_repo.activate_theme(theme_id)

    async def reload_themes(self) -> dict[str, Any]:
        self._theme_repo.reload()
        return {"reloaded": True, "count": len(self._theme_repo.list_themes())}

    async def get_config(self) -> dict[str, Any]:
        return {
            "config": {
                "adapter_version": "0.1.0",
                "hermes_base_url": "http://127.0.0.1:39190",
                "hermes_version": "0.12.0",
                "auto_save": True,
                "theme_dir": "~/.hermes/skins",
                "log_level": "info",
            }
        }

    async def patch_config(self, key: str, value: Any) -> dict[str, Any]:
        cfg = (await self.get_config())["config"]
        cfg[key] = value
        return {"config": cfg}

    async def get_model_config(self) -> dict[str, Any]:
        return {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "base_url": None,
            "api_key_configured": True,
            "api_key_source": ".env",
            "config_source": "config.yaml",
            "temperature": 0.7,
            "max_tokens": 4096,
            "context_window": 200000,
            "capabilities_available": True,
            "available_models": [
                {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
                {"id": "gpt-4o", "name": "GPT-4o"},
                {"id": "hermes-3-llama-3.1-70b", "name": "Hermes 3 70B"},
            ],
            "available_model_count": 3,
            "warnings": [],
        }

    def _sessions(self) -> list[dict[str, Any]]:
        return [
            {"id": "s-1", "title": "Map src directory structure", "created_at": "2026-05-06T10:00:00Z", "updated_at": "2026-05-06T10:05:00Z", "message_count": 12},
            {"id": "s-2", "title": "Review API endpoint contracts", "created_at": "2026-05-06T09:00:00Z", "updated_at": "2026-05-06T09:30:00Z", "message_count": 24},
            {"id": "s-3", "title": "Theme loader bug investigation", "created_at": "2026-05-05T14:00:00Z", "updated_at": "2026-05-05T15:20:00Z", "message_count": 18},
            {"id": "s-4", "title": "Write unit tests for adapter", "created_at": "2026-05-05T11:00:00Z", "updated_at": "2026-05-05T12:00:00Z", "message_count": 8},
            {"id": "s-5", "title": "Research paper on local-first architecture", "created_at": "2026-05-04T09:00:00Z", "updated_at": "2026-05-04T11:00:00Z", "message_count": 32},
        ]
