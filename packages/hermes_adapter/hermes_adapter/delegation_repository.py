"""Studio-owned delegation/sub-agent repository.

Delegation data is derived from persisted run events in Studio-owned studio.db.
This module never reads or writes Hermes Agent state.db.

Delegations are inferred from tool events that indicate sub-agent spawning
(e.g., tool.started events with delegation-related tool names).
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from hermes_adapter.studio_storage import StudioStorage

_DELEGATION_TOOL_PATTERNS = (
    re.compile(r"(?i)delegate|sub.?agent|spawn|dispatch|fork|child"),
)
_DEFAULT_LIMIT = 100
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,160}$")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _clean_id(value: Any, field: str) -> str | None:
    if value is None or value == "":
        return None
    text = _CONTROL_RE.sub("", str(value)).strip()
    if len(text) > 160:
        return None
    if not _ID_RE.match(text):
        return None
    return text


def _safe_text(value: Any, *, max_length: int, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value)
    text = _CONTROL_RE.sub("", text).strip()
    if len(text) > max_length:
        return text[:max_length].rstrip()
    return text


def _is_delegation_event(event_type: str, payload: Mapping[str, Any]) -> bool:
    """Check if an event indicates a delegation/sub-agent action."""
    tool_name = _safe_text(payload.get("tool"), max_length=200)
    if not tool_name:
        tool_name = _safe_text(payload.get("tool_name"), max_length=200)
    if not tool_name:
        return False
    return any(pattern.search(tool_name) for pattern in _DELEGATION_TOOL_PATTERNS)


def _extract_child_run_id(payload: Mapping[str, Any]) -> str | None:
    """Try to extract a child run ID from a delegation event payload."""
    for key in ("child_run_id", "delegated_run_id", "sub_run_id", "run_id", "target_run_id"):
        val = payload.get(key)
        if val:
            cleaned = _clean_id(val, key)
            if cleaned:
                return cleaned
    return None


class DelegationRepository:
    """Read-only delegation data derived from run events in studio.db."""

    def __init__(self, storage: StudioStorage | None = None) -> None:
        self._storage = storage or StudioStorage()

    def list_delegations(
        self,
        *,
        parent_run_id: str | None = None,
        status: str | None = None,
        limit: int = _DEFAULT_LIMIT,
    ) -> dict[str, Any]:
        """List delegations inferred from run events.

        Returns:
            {"delegations": [...], "total": N, "source": "run_events"}
        """
        safe_limit = min(max(limit, 1), 250)
        try:
            with self._storage.connect() as conn:
                delegations = self._scan_delegations(conn, safe_limit)
        except Exception:
            return {"delegations": [], "total": 0, "source": "unavailable"}

        if parent_run_id:
            delegations = [d for d in delegations if d["parent_run_id"] == parent_run_id]
        if status:
            delegations = [d for d in delegations if d["status"] == status]

        total = len(delegations)
        delegations = delegations[:safe_limit]
        return {"delegations": delegations, "total": total, "source": "run_events"}

    def get_delegation(self, delegation_id: str) -> dict[str, Any]:
        """Get a single delegation by its composite ID (parent_run_id:child_run_id)."""
        if ":" not in delegation_id:
            raise ValueError(f"Delegation '{delegation_id}' not found")
        parent_id, child_id = delegation_id.split(":", 1)
        parent_clean = _clean_id(parent_id, "parent_run_id")
        child_clean = _clean_id(child_id, "child_run_id")
        if not parent_clean or not child_clean:
            raise ValueError(f"Delegation '{delegation_id}' not found")

        try:
            with self._storage.connect() as conn:
                parent = self._get_run_summary(conn, parent_clean)
                child = self._get_run_summary(conn, child_clean)
                if not parent or not child:
                    raise ValueError(f"Delegation '{delegation_id}' not found")
                return {
                    "id": delegation_id,
                    "parent_run_id": parent_clean,
                    "child_run_id": child_clean,
                    "status": child.get("status", "unknown"),
                    "tool_name": "delegate",
                    "started_at": child.get("started_at", ""),
                    "completed_at": child.get("completed_at"),
                    "duration_ms": child.get("duration_ms"),
                    "parent_run": parent,
                    "child_run": child,
                }
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"Delegation '{delegation_id}' not found") from exc

    def _scan_delegations(self, conn: sqlite3.Connection, limit: int) -> list[dict[str, Any]]:
        """Scan run_events for delegation tool invocations."""
        rows = conn.execute(
            """
            SELECT re.run_id, re.type, re.payload_json, re.timestamp,
                   r.status AS run_status, r.session_id
            FROM run_events re
            JOIN runs r ON r.id = re.run_id
            WHERE re.type IN ('tool.started', 'tool.completed')
            ORDER BY re.timestamp DESC, re.id DESC
            LIMIT ?
            """,
            (limit * 5,),
        ).fetchall()

        delegations: list[dict[str, Any]] = []
        seen: set[str] = set()

        for row in rows:
            try:
                payload = json.loads(row["payload_json"])
            except (json.JSONDecodeError, TypeError):
                continue

            if not _is_delegation_event(row["type"], payload):
                continue

            parent_run_id = str(row["run_id"])
            child_run_id = _extract_child_run_id(payload)
            tool_name = _safe_text(
                payload.get("tool") or payload.get("tool_name"),
                max_length=200,
                fallback="delegate",
            )

            if not child_run_id:
                continue

            delegation_id = f"{parent_run_id}:{child_run_id}"
            if delegation_id in seen:
                continue
            seen.add(delegation_id)

            child_run = self._get_run_summary(conn, child_run_id)
            child_status = child_run["status"] if child_run else "unknown"

            delegations.append({
                "id": delegation_id,
                "parent_run_id": parent_run_id,
                "child_run_id": child_run_id,
                "status": child_status,
                "tool_name": tool_name,
                "started_at": str(row["timestamp"]),
                "completed_at": child_run.get("completed_at") if child_run else None,
                "duration_ms": child_run.get("duration_ms") if child_run else None,
                "session_id": str(row["session_id"]) if row["session_id"] else None,
            })

            if len(delegations) >= limit:
                break

        return delegations

    @staticmethod
    def _get_run_summary(conn: sqlite3.Connection, run_id: str) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT id, session_id, status, title, started_at, completed_at, duration_ms FROM runs WHERE id = ?",
            (run_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "session_id": row["session_id"],
            "status": row["status"],
            "title": row["title"],
            "started_at": row["started_at"],
            "completed_at": row["completed_at"],
            "duration_ms": row["duration_ms"],
        }
