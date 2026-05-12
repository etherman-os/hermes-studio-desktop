"""Studio-owned persistent Kanban repository.

Kanban data is stored only in Studio-owned studio.db. This module never reads or
writes Hermes Agent state.db.
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any, cast
from uuid import uuid4

from hermes_adapter.studio_storage import StudioStorage, StudioStorageError

_DEFAULT_BOARD_ID = "board_default"
_DEFAULT_BOARD_NAME = "Default Board"
_DEFAULT_COLUMNS = (
    ("col_default_inbox", "Inbox", "inbox"),
    ("col_default_ready", "Ready", "ready"),
    ("col_default_doing", "Doing", "doing"),
    ("col_default_blocked", "Blocked", "blocked"),
    ("col_default_done", "Done", "done"),
)
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
_SECRET_KEY_RE = re.compile(r"(?i)(api[_-]?key|token|secret|password|auth|bearer)")
_SECRET_VALUE_PATTERNS = (
    re.compile(r"Bearer\s+\S+", re.IGNORECASE),
    re.compile(r"(?i)\b(sk-|xai-|tvly-)[a-zA-Z0-9]+"),
    re.compile(r"\b[a-f0-9]{32,}\b", re.IGNORECASE),
)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _clean_text(value: Any, field: str, *, max_length: int, required: bool = False) -> str:
    if value is None:
        if required:
            raise ValueError(f"{field} is required")
        return ""
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    cleaned = _CONTROL_RE.sub("", value).strip()
    if required and not cleaned:
        raise ValueError(f"{field} is required")
    if len(cleaned) > max_length:
        raise ValueError(f"{field} must be {max_length} characters or less")
    _reject_secret_text(field, cleaned)
    return cleaned


def _clean_optional_id(value: Any, field: str) -> str | None:
    if value is None or value == "":
        return None
    text = _clean_text(value, field, max_length=128, required=True)
    if not _ID_RE.match(text):
        raise ValueError(f"{field} has invalid characters")
    return text


def _clean_position(value: Any, *, default: int) -> int:
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("position must be an integer")
    return max(value, 0)


def _reject_secret_text(field: str, value: str) -> None:
    if _SECRET_KEY_RE.search(field):
        raise StudioStorageError("Kanban refuses secret-like fields")
    if any(pattern.search(value) for pattern in _SECRET_VALUE_PATTERNS):
        raise StudioStorageError("Kanban refuses secret-like values")


def _validate_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in payload.items():
        clean_key = _clean_text(key, "payload key", max_length=64, required=True)
        _reject_secret_text(clean_key, "")
        if isinstance(value, str):
            result[clean_key] = _clean_text(value, clean_key, max_length=1000)
        elif isinstance(value, (int, float, bool)) or value is None:
            result[clean_key] = value
        elif isinstance(value, list | dict):
            encoded = json.dumps(value, sort_keys=True, ensure_ascii=False)
            _reject_secret_text(clean_key, encoded)
            result[clean_key] = value
        else:
            raise ValueError("payload values must be JSON-serializable")
    return result


class KanbanRepository:
    """Persistent Kanban operations backed by StudioStorage."""

    def __init__(self, storage: StudioStorage | None = None) -> None:
        self._storage = storage or StudioStorage()

    def get_boards(self) -> list[dict[str, Any]]:
        with self._storage.connect() as conn:
            self._ensure_default_board(conn)
            rows = conn.execute("SELECT * FROM boards ORDER BY created_at, id").fetchall()
            return [self._board_summary(row) for row in rows]

    def get_default_board(self) -> dict[str, Any]:
        with self._storage.connect() as conn:
            board_id = self._ensure_default_board(conn)
            return self._get_board(conn, board_id)

    def get_board(self, board_id: str) -> dict[str, Any]:
        clean_board_id = _clean_optional_id(board_id, "board_id")
        if not clean_board_id:
            raise ValueError("board_id is required")
        with self._storage.connect() as conn:
            self._ensure_default_board(conn)
            return self._get_board(conn, clean_board_id)

    def find_cards(
        self,
        *,
        run_id: str | None = None,
        session_id: str | None = None,
        card_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        filters = ["archived_at IS NULL"]
        params: list[Any] = []
        if run_id:
            filters.append("run_id = ?")
            params.append(_clean_optional_id(run_id, "run_id"))
        if session_id:
            filters.append("session_id = ?")
            params.append(_clean_optional_id(session_id, "session_id"))
        if card_id:
            filters.append("id = ?")
            params.append(self._clean_card_id(card_id))
        safe_limit = min(max(limit, 1), 100)
        where = " AND ".join(filters)
        with self._storage.connect() as conn:
            self._ensure_default_board(conn)
            rows = conn.execute(
                f"""
                SELECT * FROM cards
                WHERE {where}
                ORDER BY updated_at DESC, id DESC
                LIMIT ?
                """,  # noqa: S608
                (*params, safe_limit),
            ).fetchall()
            return [self._card_dict(row) for row in rows]

    def create_card(self, input_data: Mapping[str, Any]) -> dict[str, Any]:
        title = _clean_text(input_data.get("title"), "title", max_length=200, required=True)
        description = _clean_text(input_data.get("description"), "description", max_length=5000)
        priority = _clean_text(input_data.get("priority", "normal"), "priority", max_length=32) or "normal"
        session_id = _clean_optional_id(input_data.get("session_id"), "session_id")
        run_id = _clean_optional_id(input_data.get("run_id"), "run_id")

        with self._storage.connect() as conn:
            board_id = _clean_optional_id(input_data.get("board_id"), "board_id")
            if not board_id:
                board_id = self._ensure_default_board(conn)
            self._require_board(conn, board_id)

            column_id = _clean_optional_id(input_data.get("column_id"), "column_id")
            if not column_id:
                column_id = self._first_column_id(conn, board_id)
            column = self._require_column(conn, column_id, board_id)
            position = _clean_position(input_data.get("position"), default=self._next_position(conn, column_id))
            status = _clean_text(input_data.get("status", column["semantic_status"]), "status", max_length=64)
            card_id = _new_id("card")
            now = _now_iso()
            conn.execute(
                """
                INSERT INTO cards (
                  id, board_id, column_id, title, description, priority, status, position,
                  session_id, run_id, created_at, updated_at, archived_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    card_id,
                    board_id,
                    column_id,
                    title,
                    description,
                    priority,
                    status,
                    position,
                    session_id,
                    run_id,
                    now,
                    now,
                ),
            )
            self._reorder_column(conn, column_id, card_id, position)
            self._touch_board(conn, board_id)
            self._add_card_event(conn, card_id, "card.created", {"title": title})
            return self._require_card(conn, card_id)

    def update_card(self, card_id: str, input_data: Mapping[str, Any]) -> dict[str, Any]:
        clean_card_id = self._clean_card_id(card_id)
        allowed = {
            "title": ("title", 200),
            "description": ("description", 5000),
            "priority": ("priority", 32),
            "status": ("status", 64),
        }
        updates: dict[str, str] = {}
        for key, (field, max_length) in allowed.items():
            if key in input_data:
                updates[key] = _clean_text(input_data[key], field, max_length=max_length, required=key == "title")
        with self._storage.connect() as conn:
            card = self._require_card(conn, clean_card_id)
            if updates:
                now = _now_iso()
                if "title" in updates:
                    conn.execute(
                        "UPDATE cards SET title = ?, updated_at = ? WHERE id = ?",
                        (updates["title"], now, clean_card_id),
                    )
                if "description" in updates:
                    conn.execute(
                        "UPDATE cards SET description = ?, updated_at = ? WHERE id = ?",
                        (updates["description"], now, clean_card_id),
                    )
                if "priority" in updates:
                    conn.execute(
                        "UPDATE cards SET priority = ?, updated_at = ? WHERE id = ?",
                        (updates["priority"], now, clean_card_id),
                    )
                if "status" in updates:
                    conn.execute(
                        "UPDATE cards SET status = ?, updated_at = ? WHERE id = ?",
                        (updates["status"], now, clean_card_id),
                    )
                self._touch_board(conn, card["board_id"])
                self._add_card_event(conn, clean_card_id, "card.updated", {"fields": sorted(updates)})
            return self._require_card(conn, clean_card_id)

    def move_card(self, card_id: str, column_id: str, position: int) -> dict[str, Any]:
        clean_card_id = self._clean_card_id(card_id)
        clean_column_id = _clean_optional_id(column_id, "column_id")
        if not clean_column_id:
            raise ValueError("column_id is required")
        clean_position = _clean_position(position, default=0)
        with self._storage.connect() as conn:
            card = self._require_card(conn, clean_card_id)
            column = self._require_column(conn, clean_column_id, card["board_id"])
            old_column_id = str(card["column_id"])
            conn.execute(
                """
                UPDATE cards
                SET column_id = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (clean_column_id, column["semantic_status"], _now_iso(), clean_card_id),
            )
            if old_column_id != clean_column_id:
                self._compact_column(conn, old_column_id)
            self._reorder_column(conn, clean_column_id, clean_card_id, clean_position)
            self._touch_board(conn, card["board_id"])
            self._add_card_event(
                conn,
                clean_card_id,
                "card.moved",
                {"column_id": clean_column_id, "position": clean_position},
            )
            return self._require_card(conn, clean_card_id)

    def archive_card(self, card_id: str) -> dict[str, Any]:
        clean_card_id = self._clean_card_id(card_id)
        with self._storage.connect() as conn:
            card = self._require_card(conn, clean_card_id, include_archived=True)
            if not card.get("archived_at"):
                archived_at = _now_iso()
                conn.execute(
                    "UPDATE cards SET archived_at = ?, updated_at = ? WHERE id = ?",
                    (archived_at, archived_at, clean_card_id),
                )
                self._compact_column(conn, str(card["column_id"]))
                self._touch_board(conn, card["board_id"])
                self._add_card_event(conn, clean_card_id, "card.archived", {})
            return self._require_card(conn, clean_card_id, include_archived=True)

    def link_card_to_session(self, card_id: str, session_id: str) -> dict[str, Any]:
        return self._link_card(card_id, "session_id", session_id, "card.linked_session")

    def link_card_to_run(self, card_id: str, run_id: str) -> dict[str, Any]:
        return self._link_card(card_id, "run_id", run_id, "card.linked_run")

    def add_card_event(self, card_id: str, event_type: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        clean_card_id = self._clean_card_id(card_id)
        clean_type = _clean_text(event_type, "event_type", max_length=64, required=True)
        clean_payload = _validate_payload(payload)
        with self._storage.connect() as conn:
            self._require_card(conn, clean_card_id, include_archived=True)
            return self._add_card_event(conn, clean_card_id, clean_type, clean_payload)

    def _link_card(self, card_id: str, field: str, value: str, event_type: str) -> dict[str, Any]:
        clean_card_id = self._clean_card_id(card_id)
        clean_value = _clean_optional_id(value, field)
        if not clean_value:
            raise ValueError(f"{field} is required")
        with self._storage.connect() as conn:
            card = self._require_card(conn, clean_card_id)
            if field == "session_id":
                conn.execute(
                    "UPDATE cards SET session_id = ?, updated_at = ? WHERE id = ?",
                    (clean_value, _now_iso(), clean_card_id),
                )
            elif field == "run_id":
                conn.execute(
                    "UPDATE cards SET run_id = ?, updated_at = ? WHERE id = ?",
                    (clean_value, _now_iso(), clean_card_id),
                )
            else:
                raise ValueError(f"Unsupported link field: {field}")
            self._touch_board(conn, card["board_id"])
            self._add_card_event(conn, clean_card_id, event_type, {field: clean_value})
            return self._require_card(conn, clean_card_id)

    def _ensure_default_board(self, conn: sqlite3.Connection) -> str:
        row = conn.execute("SELECT id FROM boards WHERE id = ?", (_DEFAULT_BOARD_ID,)).fetchone()
        if row:
            self._ensure_default_columns(conn, _DEFAULT_BOARD_ID)
            return _DEFAULT_BOARD_ID

        now = _now_iso()
        conn.execute(
            "INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (_DEFAULT_BOARD_ID, _DEFAULT_BOARD_NAME, now, now),
        )
        self._ensure_default_columns(conn, _DEFAULT_BOARD_ID)
        return _DEFAULT_BOARD_ID

    @staticmethod
    def _ensure_default_columns(conn: sqlite3.Connection, board_id: str) -> None:
        now = _now_iso()
        for position, (column_id, name, semantic_status) in enumerate(_DEFAULT_COLUMNS):
            conn.execute(
                """
                INSERT OR IGNORE INTO columns (
                  id, board_id, name, semantic_status, position, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (column_id, board_id, name, semantic_status, position, now, now),
            )

    @staticmethod
    def _board_summary(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _get_board(self, conn: sqlite3.Connection, board_id: str) -> dict[str, Any]:
        board_row = self._require_board(conn, board_id)
        columns = [
            self._column_with_cards(conn, row)
            for row in conn.execute(
                "SELECT * FROM columns WHERE board_id = ? ORDER BY position, created_at, id",
                (board_id,),
            ).fetchall()
        ]
        board = self._board_summary(board_row)
        board["columns"] = columns
        board["card_count"] = sum(len(column["cards"]) for column in columns)
        return board

    def _column_with_cards(self, conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        column = {
            "id": row["id"],
            "board_id": row["board_id"],
            "name": row["name"],
            "semantic_status": row["semantic_status"],
            "position": row["position"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        cards = conn.execute(
            """
            SELECT * FROM cards
            WHERE column_id = ? AND archived_at IS NULL
            ORDER BY position, created_at, id
            """,
            (row["id"],),
        ).fetchall()
        column["cards"] = [self._card_dict(card) for card in cards]
        return column

    @staticmethod
    def _card_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "board_id": row["board_id"],
            "column_id": row["column_id"],
            "title": row["title"],
            "description": row["description"],
            "priority": row["priority"],
            "status": row["status"],
            "position": row["position"],
            "session_id": row["session_id"],
            "run_id": row["run_id"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "archived_at": row["archived_at"],
        }

    @staticmethod
    def _event_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "card_id": row["card_id"],
            "type": row["type"],
            "payload": json.loads(row["payload_json"]),
            "created_at": row["created_at"],
        }

    @staticmethod
    def _require_board(conn: sqlite3.Connection, board_id: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()
        if not row:
            raise ValueError(f"Board '{board_id}' not found")
        return cast(sqlite3.Row, row)

    @staticmethod
    def _require_column(conn: sqlite3.Connection, column_id: str, board_id: str) -> sqlite3.Row:
        row = conn.execute(
            "SELECT * FROM columns WHERE id = ? AND board_id = ?",
            (column_id, board_id),
        ).fetchone()
        if not row:
            raise ValueError(f"Column '{column_id}' not found")
        return cast(sqlite3.Row, row)

    def _require_card(
        self,
        conn: sqlite3.Connection,
        card_id: str,
        *,
        include_archived: bool = False,
    ) -> dict[str, Any]:
        sql = "SELECT * FROM cards WHERE id = ?"
        if not include_archived:
            sql += " AND archived_at IS NULL"
        row = conn.execute(sql, (card_id,)).fetchone()
        if not row:
            raise ValueError(f"Card '{card_id}' not found")
        return self._card_dict(row)

    @staticmethod
    def _first_column_id(conn: sqlite3.Connection, board_id: str) -> str:
        row = conn.execute(
            "SELECT id FROM columns WHERE board_id = ? ORDER BY position, created_at, id LIMIT 1",
            (board_id,),
        ).fetchone()
        if not row:
            raise ValueError(f"Board '{board_id}' has no columns")
        return str(row["id"])

    @staticmethod
    def _next_position(conn: sqlite3.Connection, column_id: str) -> int:
        row = conn.execute(
            "SELECT COALESCE(MAX(position) + 1, 0) AS next_position FROM cards WHERE column_id = ? AND archived_at IS NULL",
            (column_id,),
        ).fetchone()
        return int(row["next_position"] or 0)

    def _reorder_column(
        self,
        conn: sqlite3.Connection,
        column_id: str,
        card_id: str,
        position: int,
    ) -> None:
        rows = conn.execute(
            """
            SELECT id FROM cards
            WHERE column_id = ? AND archived_at IS NULL AND id != ?
            ORDER BY position, created_at, id
            """,
            (column_id, card_id),
        ).fetchall()
        ids = [str(row["id"]) for row in rows]
        target = min(max(position, 0), len(ids))
        ids.insert(target, card_id)
        now = _now_iso()
        for index, current_id in enumerate(ids):
            conn.execute(
                "UPDATE cards SET position = ?, updated_at = ? WHERE id = ?",
                (index, now, current_id),
            )

    def _compact_column(self, conn: sqlite3.Connection, column_id: str) -> None:
        rows = conn.execute(
            """
            SELECT id FROM cards
            WHERE column_id = ? AND archived_at IS NULL
            ORDER BY position, created_at, id
            """,
            (column_id,),
        ).fetchall()
        now = _now_iso()
        for index, row in enumerate(rows):
            conn.execute(
                "UPDATE cards SET position = ?, updated_at = ? WHERE id = ?",
                (index, now, row["id"]),
            )

    @staticmethod
    def _touch_board(conn: sqlite3.Connection, board_id: str) -> None:
        conn.execute("UPDATE boards SET updated_at = ? WHERE id = ?", (_now_iso(), board_id))

    def _add_card_event(
        self,
        conn: sqlite3.Connection,
        card_id: str,
        event_type: str,
        payload: Mapping[str, Any],
    ) -> dict[str, Any]:
        clean_payload = _validate_payload(payload)
        event_id = _new_id("evt")
        created_at = _now_iso()
        conn.execute(
            """
            INSERT INTO card_events (id, card_id, type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                event_id,
                card_id,
                event_type,
                json.dumps(clean_payload, sort_keys=True, ensure_ascii=False),
                created_at,
            ),
        )
        row = conn.execute("SELECT * FROM card_events WHERE id = ?", (event_id,)).fetchone()
        if not row:
            raise RuntimeError(f"Card event '{event_id}' was not persisted")
        return self._event_dict(row)

    @staticmethod
    def _clean_card_id(card_id: str) -> str:
        clean_card_id = _clean_optional_id(card_id, "card_id")
        if not clean_card_id:
            raise ValueError("card_id is required")
        return clean_card_id
