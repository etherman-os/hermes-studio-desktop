"""Studio-owned persistent run ledger repository.

Run ledger data is stored only in Studio-owned studio.db. This module never
reads or writes Hermes Agent state.db.
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any, cast

from hermes_adapter.studio_storage import StudioStorage

_MAX_RUNS_RETAINED = 200
_DEFAULT_RECENT_LIMIT = 50
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,160}$")
_SECRET_KEY_RE = re.compile(r"(?i)(api[_-]?key|token|secret|password|auth|bearer|credential)")
_SECRET_VALUE_PATTERNS = (
    re.compile(r"Bearer\s+\S+", re.IGNORECASE),
    re.compile(r"(?i)\b(sk-|xai-|tvly-)[a-zA-Z0-9._-]+"),
    re.compile(r"\b[a-f0-9]{32,}\b", re.IGNORECASE),
)
_TERMINAL_STATUS_BY_EVENT = {
    "run.completed": "completed",
    "run.failed": "failed",
    "run.cancelled": "cancelled",
}
_RUNNING_EVENTS = {
    "run.started",
    "assistant.delta",
    "assistant.completed",
    "tool.started",
    "tool.progress",
    "tool.completed",
    "approval.requested",
    "approval.resolved",
    "memory.updated",
    "kanban.updated",
}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _clean_id(value: Any, field: str, *, required: bool = True) -> str | None:
    if value is None or value == "":
        if required:
            raise ValueError(f"{field} is required")
        return None
    text = _safe_text(value, max_length=160)
    if not _ID_RE.match(text):
        raise ValueError(f"{field} has invalid characters")
    return text


def _safe_text(value: Any, *, max_length: int, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value)
    text = _CONTROL_RE.sub("", text).strip()
    for pattern in _SECRET_VALUE_PATTERNS:
        text = pattern.sub("[redacted]", text)
    if len(text) > max_length:
        return text[: max_length - 3].rstrip() + "..."
    return text


def _safe_status(value: Any) -> str:
    text = _safe_text(value, max_length=32, fallback="running") or "running"
    if text == "started":
        return "running"
    if text in {"queued", "running", "completed", "failed", "cancelled", "stopping", "idle"}:
        return text
    return "running"


def _safe_workspace_path(value: Any) -> str | None:
    text = _safe_text(value, max_length=1000)
    if not text:
        return None
    return text


def _redact_json(value: Any, *, key: str = "") -> Any:
    if _SECRET_KEY_RE.search(key):
        return "[redacted]"

    if isinstance(value, str):
        return _safe_text(value, max_length=4000)
    if isinstance(value, int | float | bool) or value is None:
        return value
    if isinstance(value, Mapping):
        redacted: dict[str, Any] = {}
        for raw_key, raw_value in list(value.items())[:100]:
            clean_key = _safe_text(raw_key, max_length=120, fallback="key")
            redacted[clean_key] = _redact_json(raw_value, key=clean_key)
        return redacted
    if isinstance(value, list | tuple):
        return [_redact_json(item, key=key) for item in list(value)[:100]]
    return _safe_text(value, max_length=1000)


def _payload_from_event(event: Mapping[str, Any]) -> dict[str, Any]:
    payload = event.get("payload", {})
    if isinstance(payload, Mapping):
        return cast(dict[str, Any], _redact_json(payload))
    return {"value": _redact_json(payload)}


def _timestamp_from_event(event: Mapping[str, Any]) -> str:
    timestamp = event.get("timestamp")
    if isinstance(timestamp, str) and timestamp.strip():
        return _safe_text(timestamp, max_length=80)
    return _now_iso()


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _duration_ms(started_at: str, completed_at: str) -> int | None:
    started = _parse_iso(started_at)
    completed = _parse_iso(completed_at)
    if not started or not completed:
        return None
    return max(0, int((completed - started).total_seconds() * 1000))


class RunLedgerRepository:
    """Persistent run ledger operations backed by StudioStorage."""

    def __init__(self, storage: StudioStorage | None = None) -> None:
        self._storage = storage or StudioStorage()

    def create_run(
        self,
        *,
        run_id: str,
        session_id: str | None,
        status: str,
        prompt: str,
        backend: str,
        model: str | None = None,
        workspace_path: str | None = None,
    ) -> dict[str, Any]:
        clean_run_id = _clean_id(run_id, "run_id")
        if clean_run_id is None:
            raise ValueError("run_id is required")
        clean_session_id = _clean_id(session_id, "session_id", required=False)
        prompt_preview = _safe_text(prompt, max_length=500)
        clean_workspace_path = _safe_workspace_path(workspace_path)
        title = self._title_from_prompt(prompt_preview)
        now = _now_iso()
        with self._storage.connect() as conn:
            conn.execute(
                """
                INSERT INTO runs (
                  id, session_id, status, title, prompt_preview, started_at,
                  completed_at, duration_ms, backend, model, error, workspace_path
                )
                VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?)
                ON CONFLICT(id) DO UPDATE SET
                  session_id = COALESCE(excluded.session_id, runs.session_id),
                  status = excluded.status,
                  title = COALESCE(excluded.title, runs.title),
                  prompt_preview = COALESCE(excluded.prompt_preview, runs.prompt_preview),
                  backend = excluded.backend,
                  model = COALESCE(excluded.model, runs.model),
                  workspace_path = COALESCE(excluded.workspace_path, runs.workspace_path)
                """,
                (
                    clean_run_id,
                    clean_session_id,
                    _safe_status(status),
                    title,
                    prompt_preview,
                    now,
                    _safe_text(backend, max_length=64, fallback="unknown") or "unknown",
                    _safe_text(model, max_length=160) if model else None,
                    clean_workspace_path,
                ),
            )
            self._prune_old_runs(conn)
            return self._require_run(conn, clean_run_id)

    def append_event(self, run_id: str, event: Mapping[str, Any]) -> dict[str, Any]:
        clean_run_id = _clean_id(run_id, "run_id")
        if clean_run_id is None:
            raise ValueError("run_id is required")

        event_id = _clean_id(event.get("id"), "event.id")
        if event_id is None:
            raise ValueError("event.id is required")
        event_type = _safe_text(event.get("type"), max_length=80, fallback="adapter.warning")
        source = _safe_text(event.get("source"), max_length=32, fallback="adapter") or "adapter"
        timestamp = _timestamp_from_event(event)
        payload = _payload_from_event(event)

        with self._storage.connect() as conn:
            self._ensure_run(conn, clean_run_id, event, timestamp)
            conn.execute(
                """
                INSERT OR IGNORE INTO run_events (id, run_id, type, source, payload_json, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    clean_run_id,
                    event_type,
                    source,
                    json.dumps(payload, sort_keys=True, ensure_ascii=False),
                    timestamp,
                ),
            )
            self._update_run_from_event(conn, clean_run_id, event_type, payload, timestamp)
            return self._event_dict(
                conn.execute("SELECT * FROM run_events WHERE id = ?", (event_id,)).fetchone()
            )

    def get_recent_runs(self, limit: int = _DEFAULT_RECENT_LIMIT) -> dict[str, Any]:
        clean_limit = min(max(limit, 1), 100)
        with self._storage.connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM runs
                ORDER BY started_at DESC, id DESC
                LIMIT ?
                """,
                (clean_limit,),
            ).fetchall()
            total = conn.execute("SELECT COUNT(*) AS total FROM runs").fetchone()
            return {
                "runs": [self._run_dict(row) for row in rows],
                "total": int(total["total"] if total else 0),
                "history_available": True,
            }

    def get_run(self, run_id: str) -> dict[str, Any]:
        clean_run_id = _clean_id(run_id, "run_id")
        if clean_run_id is None:
            raise ValueError("run_id is required")
        with self._storage.connect() as conn:
            return self._require_run(conn, clean_run_id)

    def get_ledger(self, run_id: str) -> dict[str, Any]:
        clean_run_id = _clean_id(run_id, "run_id")
        if clean_run_id is None:
            raise ValueError("run_id is required")
        with self._storage.connect() as conn:
            run = self._require_run(conn, clean_run_id)
            rows = conn.execute(
                """
                SELECT * FROM run_events
                WHERE run_id = ?
                ORDER BY timestamp, id
                """,
                (clean_run_id,),
            ).fetchall()
            return {
                "run": run,
                "events": [self._event_dict(row, run=run) for row in rows],
                "history_available": True,
            }

    def _ensure_run(
        self,
        conn: sqlite3.Connection,
        run_id: str,
        event: Mapping[str, Any],
        timestamp: str,
    ) -> None:
        row = conn.execute("SELECT id FROM runs WHERE id = ?", (run_id,)).fetchone()
        if row:
            return

        payload = event.get("payload") if isinstance(event.get("payload"), Mapping) else {}
        if not isinstance(payload, Mapping):
            payload = {}
        session_id = event.get("session_id") or payload.get("session_id")
        status = _TERMINAL_STATUS_BY_EVENT.get(str(event.get("type")), "running")
        error = payload.get("message") if status == "failed" else None
        conn.execute(
            """
            INSERT INTO runs (
              id, session_id, status, title, prompt_preview, started_at,
              completed_at, duration_ms, backend, model, error, workspace_path
            )
            VALUES (?, ?, ?, NULL, NULL, ?, ?, NULL, ?, NULL, ?, NULL)
            """,
            (
                run_id,
                _clean_id(session_id, "session_id", required=False),
                status,
                timestamp,
                timestamp if status in {"completed", "failed", "cancelled"} else None,
                _safe_text(event.get("source"), max_length=32, fallback="unknown") or "unknown",
                _safe_text(error, max_length=1000) if error else None,
            ),
        )

    def _update_run_from_event(
        self,
        conn: sqlite3.Connection,
        run_id: str,
        event_type: str,
        payload: Mapping[str, Any],
        timestamp: str,
    ) -> None:
        run = self._require_run(conn, run_id)

        if event_type == "run.started":
            session_id = payload.get("session_id")
            conn.execute(
                """
                UPDATE runs
                SET status = ?, session_id = COALESCE(?, session_id), started_at = COALESCE(started_at, ?)
                WHERE id = ?
                """,
                ("running", _clean_id(session_id, "session_id", required=False), timestamp, run_id),
            )
            return

        if event_type == "assistant.completed":
            duration = payload.get("duration_ms")
            conn.execute(
                """
                UPDATE runs
                SET model = COALESCE(?, model),
                    duration_ms = COALESCE(?, duration_ms)
                WHERE id = ?
                """,
                (
                    _safe_text(payload.get("model"), max_length=160) if payload.get("model") else None,
                    duration if isinstance(duration, int) and duration >= 0 else None,
                    run_id,
                ),
            )
            return

        if event_type in _TERMINAL_STATUS_BY_EVENT:
            status = _TERMINAL_STATUS_BY_EVENT[event_type]
            duration_value = payload.get("duration_ms")
            duration = duration_value if isinstance(duration_value, int) and duration_value >= 0 else None
            if duration is None:
                duration = _duration_ms(str(run["started_at"]), timestamp)
            error = None
            if status == "failed":
                error = _safe_text(payload.get("message") or payload.get("error"), max_length=1000)
            conn.execute(
                """
                UPDATE runs
                SET status = ?, completed_at = ?, duration_ms = COALESCE(?, duration_ms), error = ?
                WHERE id = ?
                """,
                (status, timestamp, duration, error, run_id),
            )
            return

        if event_type in _RUNNING_EVENTS and run["status"] in {"queued", "idle", "started"}:
            conn.execute("UPDATE runs SET status = ? WHERE id = ?", ("running", run_id))

    def _prune_old_runs(self, conn: sqlite3.Connection) -> None:
        rows = conn.execute(
            """
            SELECT id FROM runs
            ORDER BY started_at DESC, id DESC
            LIMIT -1 OFFSET ?
            """,
            (_MAX_RUNS_RETAINED,),
        ).fetchall()
        for row in rows:
            conn.execute("DELETE FROM runs WHERE id = ?", (row["id"],))

    @staticmethod
    def _title_from_prompt(prompt_preview: str) -> str | None:
        first_line = prompt_preview.splitlines()[0].strip() if prompt_preview else ""
        if not first_line:
            return None
        return _safe_text(first_line, max_length=120)

    def _require_run(self, conn: sqlite3.Connection, run_id: str) -> dict[str, Any]:
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        if not row:
            raise ValueError(f"Run '{run_id}' not found")
        return self._run_dict(row)

    @staticmethod
    def _run_dict(row: sqlite3.Row) -> dict[str, Any]:
        values = dict(row)
        return {
            "id": values["id"],
            "session_id": values["session_id"],
            "status": values["status"],
            "title": values["title"],
            "prompt_preview": values["prompt_preview"],
            "started_at": values["started_at"],
            "completed_at": values["completed_at"],
            "duration_ms": values["duration_ms"],
            "backend": values["backend"],
            "model": values["model"],
            "error": values["error"],
            "workspace_path": values.get("workspace_path"),
        }

    @staticmethod
    def _event_dict(row: sqlite3.Row | None, *, run: Mapping[str, Any] | None = None) -> dict[str, Any]:
        if not row:
            raise RuntimeError("Run event was not persisted")
        event: dict[str, Any] = {
            "id": row["id"],
            "type": row["type"],
            "timestamp": row["timestamp"],
            "source": row["source"],
            "payload": json.loads(row["payload_json"]),
            "run_id": row["run_id"],
        }
        if run and run.get("session_id"):
            event["session_id"] = run["session_id"]
        return event
