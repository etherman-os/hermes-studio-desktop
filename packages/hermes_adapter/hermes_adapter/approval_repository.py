"""Studio-owned persistent approval history repository.

Approval records are visibility/audit metadata stored only in Studio-owned
studio.db. This module never answers approvals through Hermes and never writes
Hermes Agent state.db.
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from hermes_adapter.studio_storage import StudioStorage

_STATUSES = {"pending", "approved", "denied", "expired", "cancelled", "unknown"}
_RISK_LEVELS = {"low", "medium", "high", "critical", "unknown"}
_DECISIONS = {"approved", "denied", "expired", "cancelled", "unknown"}
_DEFAULT_LIMIT = 100
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,160}$")
_SECRET_KEY_RE = re.compile(r"(?i)(api[_-]?key|token|secret|password|auth|bearer|credential)")
_SECRET_VALUE_PATTERNS = (
    re.compile(r"Bearer\s+[A-Za-z0-9._:-]+", re.IGNORECASE),
    re.compile(r"(?i)\b(sk-|xai-|tvly-)[a-zA-Z0-9._-]+"),
    re.compile(r"(?i)\b(api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[^'\"\\s]+"),
    re.compile(r"\b[a-f0-9]{32,}\b", re.IGNORECASE),
)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _redact_text(value: str) -> str:
    redacted = value
    for pattern in _SECRET_VALUE_PATTERNS:
        redacted = pattern.sub("[REDACTED]", redacted)
    return redacted


def _clean_text(value: Any, field: str, *, max_length: int, required: bool = False) -> str:
    if value is None:
        if required:
            raise ValueError(f"{field} is required")
        return ""
    if not isinstance(value, str):
        value = str(value)
    cleaned = _CONTROL_RE.sub("", value).strip()
    if required and not cleaned:
        raise ValueError(f"{field} is required")
    if len(cleaned) > max_length:
        cleaned = cleaned[: max_length - 3].rstrip() + "..."
    return _redact_text(cleaned)


def _clean_optional_id(value: Any, field: str) -> str | None:
    text = _clean_text(value, field, max_length=160)
    if not text:
        return None
    if not _ID_RE.match(text):
        raise ValueError(f"{field} has invalid characters")
    return text


def _approval_id_from_event(event: Mapping[str, Any]) -> str:
    payload = _payload(event)
    approval_id = _clean_optional_id(payload.get("approval_id"), "approval_id")
    if approval_id:
        return approval_id
    event_id = _clean_optional_id(event.get("id"), "event.id")
    if event_id:
        return event_id
    return _new_id("approval")


def _clean_status(value: Any) -> str:
    status = _clean_text(value or "unknown", "status", max_length=32).lower() or "unknown"
    return status if status in _STATUSES else "unknown"


def _clean_risk(value: Any) -> str:
    risk = _clean_text(value or "unknown", "risk_level", max_length=32).lower() or "unknown"
    return risk if risk in _RISK_LEVELS else "unknown"


def _clean_decision(value: Any) -> str | None:
    decision = _clean_text(value or "", "decision", max_length=32).lower()
    if not decision:
        return None
    return decision if decision in _DECISIONS else "unknown"


def _status_from_decision(decision: str | None) -> str:
    if decision == "approved":
        return "approved"
    if decision == "denied":
        return "denied"
    if decision == "expired":
        return "expired"
    if decision == "cancelled":
        return "cancelled"
    return "unknown"


def _payload(event: Mapping[str, Any]) -> Mapping[str, Any]:
    payload = event.get("payload", {})
    return payload if isinstance(payload, Mapping) else {"value": payload}


def _safe_payload_value(value: Any, *, key: str = "") -> Any:
    if _SECRET_KEY_RE.search(key):
        return "[REDACTED]"
    if isinstance(value, str):
        return _clean_text(value, key or "value", max_length=4000)
    if isinstance(value, int | float | bool) or value is None:
        return value
    if isinstance(value, Mapping):
        result: dict[str, Any] = {}
        for raw_key, raw_value in list(value.items())[:100]:
            clean_key = _clean_text(raw_key, "payload key", max_length=120, required=True)
            result[clean_key] = _safe_payload_value(raw_value, key=clean_key)
        return result
    if isinstance(value, list | tuple):
        return [_safe_payload_value(item, key=key) for item in list(value)[:100]]
    return _clean_text(value, key or "value", max_length=1000)


def _safe_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        _clean_text(key, "payload key", max_length=120, required=True): _safe_payload_value(value, key=str(key))
        for key, value in list(payload.items())[:100]
    }


def _event_time(event: Mapping[str, Any]) -> str:
    timestamp = event.get("timestamp")
    if isinstance(timestamp, str) and timestamp.strip():
        return _clean_text(timestamp, "timestamp", max_length=80)
    return _now_iso()


class ApprovalRepository:
    """Persistent approval visibility operations backed by StudioStorage."""

    def __init__(self, storage: StudioStorage | None = None) -> None:
        self._storage = storage or StudioStorage()

    def list_approvals(
        self,
        *,
        status: str | None = None,
        risk_level: str | None = None,
        run_id: str | None = None,
        session_id: str | None = None,
        limit: int = _DEFAULT_LIMIT,
    ) -> dict[str, Any]:
        filters: list[str] = []
        params: list[Any] = []
        if status:
            filters.append("status = ?")
            params.append(_clean_status(status))
        if risk_level:
            filters.append("risk_level = ?")
            params.append(_clean_risk(risk_level))
        if run_id:
            filters.append("run_id = ?")
            params.append(_clean_optional_id(run_id, "run_id"))
        if session_id:
            filters.append("session_id = ?")
            params.append(_clean_optional_id(session_id, "session_id"))

        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        safe_limit = min(max(limit, 1), 250)
        with self._storage.connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM approvals
                {where}
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,  # noqa: S608
                (*params, safe_limit),
            ).fetchall()
            return {"approvals": [self._approval_dict(row, include_payload=False) for row in rows], "total": len(rows)}

    def get_approval(self, approval_id: str) -> dict[str, Any]:
        with self._storage.connect() as conn:
            approval = self._require_approval(conn, approval_id, include_payload=True)
            rows = conn.execute(
                "SELECT * FROM approval_events WHERE approval_id = ? ORDER BY created_at, id",
                (approval["id"],),
            ).fetchall()
            approval["events"] = [self._event_dict(row) for row in rows]
            return approval

    def list_pending_approvals(self) -> dict[str, Any]:
        return self.list_approvals(status="pending", limit=100)

    def list_approvals_for_run(self, run_id: str) -> dict[str, Any]:
        return self.list_approvals(run_id=run_id, limit=100)

    def list_approvals_for_session(self, session_id: str) -> dict[str, Any]:
        return self.list_approvals(session_id=session_id, limit=100)

    def record_approval_requested(self, event: Mapping[str, Any]) -> dict[str, Any]:
        payload = _payload(event)
        approval_id = _approval_id_from_event(event)
        run_id = _clean_optional_id(event.get("run_id") or payload.get("run_id"), "run_id")
        session_id = _clean_optional_id(event.get("session_id") or payload.get("session_id"), "session_id")
        tool_name = _clean_text(payload.get("tool") or payload.get("tool_name"), "tool_name", max_length=160) or None
        command = _clean_text(payload.get("command") or payload.get("action"), "command", max_length=1000) or None
        reason = _clean_text(payload.get("reason") or payload.get("description") or payload.get("message"), "reason", max_length=2000) or None
        risk_level = _clean_risk(payload.get("risk_level") or payload.get("risk") or payload.get("severity"))
        timestamp = _event_time(event)
        safe_payload = _safe_payload(payload)

        with self._storage.connect() as conn:
            conn.execute(
                """
                INSERT INTO approvals (
                  id, run_id, session_id, tool_name, command, risk_level, status,
                  reason, request_payload_json, decision, decided_at, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  run_id = COALESCE(excluded.run_id, approvals.run_id),
                  session_id = COALESCE(excluded.session_id, approvals.session_id),
                  tool_name = COALESCE(excluded.tool_name, approvals.tool_name),
                  command = COALESCE(excluded.command, approvals.command),
                  risk_level = excluded.risk_level,
                  status = CASE
                    WHEN approvals.status IN ('approved', 'denied', 'expired', 'cancelled') THEN approvals.status
                    ELSE excluded.status
                  END,
                  reason = COALESCE(excluded.reason, approvals.reason),
                  request_payload_json = excluded.request_payload_json,
                  updated_at = excluded.updated_at
                """,
                (
                    approval_id,
                    run_id,
                    session_id,
                    tool_name,
                    command,
                    risk_level,
                    "pending",
                    reason,
                    json.dumps(safe_payload, sort_keys=True, ensure_ascii=False),
                    timestamp,
                    timestamp,
                ),
            )
            self._add_event(conn, approval_id, "approval.requested", safe_payload, created_at=timestamp)
            return self._require_approval(conn, approval_id, include_payload=True)

    def record_approval_resolved(self, event: Mapping[str, Any]) -> dict[str, Any]:
        payload = _payload(event)
        approval_id = _approval_id_from_event(event)
        decision = _clean_decision(payload.get("decision")) or "unknown"
        status = _status_from_decision(decision)
        run_id = _clean_optional_id(event.get("run_id") or payload.get("run_id"), "run_id")
        session_id = _clean_optional_id(event.get("session_id") or payload.get("session_id"), "session_id")
        timestamp = _event_time(event)
        safe_payload = _safe_payload(payload)

        with self._storage.connect() as conn:
            existing = conn.execute("SELECT id FROM approvals WHERE id = ?", (approval_id,)).fetchone()
            if not existing:
                conn.execute(
                    """
                    INSERT INTO approvals (
                      id, run_id, session_id, tool_name, command, risk_level, status,
                      reason, request_payload_json, decision, decided_at, created_at, updated_at
                    )
                    VALUES (?, ?, ?, NULL, NULL, 'unknown', ?, NULL, ?, ?, ?, ?, ?)
                    """,
                    (
                        approval_id,
                        run_id,
                        session_id,
                        status,
                        json.dumps(safe_payload, sort_keys=True, ensure_ascii=False),
                        decision,
                        timestamp,
                        timestamp,
                        timestamp,
                    ),
                )
            else:
                conn.execute(
                    """
                    UPDATE approvals
                    SET status = ?,
                        decision = ?,
                        decided_at = ?,
                        run_id = COALESCE(?, run_id),
                        session_id = COALESCE(?, session_id),
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (status, decision, timestamp, run_id, session_id, timestamp, approval_id),
                )
            self._add_event(conn, approval_id, "approval.resolved", safe_payload, created_at=timestamp)
            return self._require_approval(conn, approval_id, include_payload=True)

    def update_local_decision(self, approval_id: str, decision: str) -> dict[str, Any]:
        """Record a local-only decision note; this does not call Hermes."""
        clean_approval_id = self._clean_approval_id(approval_id)
        clean_decision = _clean_decision(decision)
        if clean_decision not in {"approved", "denied"}:
            raise ValueError("decision must be approved or denied")
        status = _status_from_decision(clean_decision)
        now = _now_iso()
        with self._storage.connect() as conn:
            self._require_approval(conn, clean_approval_id)
            conn.execute(
                "UPDATE approvals SET status = ?, decision = ?, decided_at = ?, updated_at = ? WHERE id = ?",
                (status, clean_decision, now, now, clean_approval_id),
            )
            self._add_event(conn, clean_approval_id, "approval.local_decision", {"decision": clean_decision}, created_at=now)
            return self._require_approval(conn, clean_approval_id, include_payload=True)

    @staticmethod
    def _approval_dict(row: sqlite3.Row, *, include_payload: bool) -> dict[str, Any]:
        approval = {
            "id": row["id"],
            "run_id": row["run_id"],
            "session_id": row["session_id"],
            "tool_name": row["tool_name"],
            "command": row["command"],
            "risk_level": row["risk_level"],
            "status": row["status"],
            "reason": row["reason"],
            "decision": row["decision"],
            "decided_at": row["decided_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        if include_payload:
            raw = row["request_payload_json"]
            approval["request_payload"] = json.loads(raw) if raw else None
        return approval

    @staticmethod
    def _event_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "approval_id": row["approval_id"],
            "type": row["type"],
            "payload": json.loads(row["payload_json"]),
            "created_at": row["created_at"],
        }

    def _require_approval(
        self,
        conn: sqlite3.Connection,
        approval_id: str,
        *,
        include_payload: bool = False,
    ) -> dict[str, Any]:
        clean_approval_id = self._clean_approval_id(approval_id)
        row = conn.execute("SELECT * FROM approvals WHERE id = ?", (clean_approval_id,)).fetchone()
        if not row:
            raise ValueError(f"Approval '{approval_id}' not found")
        return self._approval_dict(row, include_payload=include_payload)

    def _add_event(
        self,
        conn: sqlite3.Connection,
        approval_id: str,
        event_type: str,
        payload: Mapping[str, Any],
        *,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        clean_payload = _safe_payload(payload)
        event_id = _new_id("approval_evt")
        timestamp = created_at or _now_iso()
        conn.execute(
            """
            INSERT INTO approval_events (id, approval_id, type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                event_id,
                approval_id,
                event_type,
                json.dumps(clean_payload, sort_keys=True, ensure_ascii=False),
                timestamp,
            ),
        )
        row = conn.execute("SELECT * FROM approval_events WHERE id = ?", (event_id,)).fetchone()
        if not row:
            raise RuntimeError(f"Approval event '{event_id}' was not persisted")
        return self._event_dict(row)

    @staticmethod
    def _clean_approval_id(approval_id: str) -> str:
        clean_approval_id = _clean_optional_id(approval_id, "approval_id")
        if not clean_approval_id:
            raise ValueError("approval_id is required")
        return clean_approval_id
