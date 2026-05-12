"""Read-only session repository for Hermes state.db.

Provides safe, read-only access to Hermes session data.
Never writes to the database. Handles missing/unsupported schemas gracefully.
"""

from __future__ import annotations

import logging
import os
import re
import sqlite3
from pathlib import Path
from typing import Any

logger = logging.getLogger("hermes_adapter.session_repository")

_SQL_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _validate_sql_identifier(name: str, kind: str = "identifier") -> str:
    """Validate that *name* is a safe SQL identifier (table or column)."""
    if not _SQL_IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid SQL {kind}: {name!r}")
    return name


def get_hermes_home() -> Path:
    """Locate the Hermes home directory.

    Priority:
    1. HERMES_STUDIO_HERMES_HOME (explicit override)
    2. HERMES_HOME
    3. ~/.hermes (default)
    """
    for var in ("HERMES_STUDIO_HERMES_HOME", "HERMES_HOME"):
        val = os.environ.get(var)
        if val:
            return Path(val).expanduser()
    return Path.home() / ".hermes"


def find_state_db(hermes_home: Path | None = None) -> Path | None:
    """Find state.db under Hermes home.

    Returns:
        Path to state.db if found, None otherwise.
    """
    home = hermes_home or get_hermes_home()
    candidates = [
        home / "state.db",
        home / "data" / "state.db",
        home / "sessions" / "state.db",
    ]
    for p in candidates:
        if p.is_file():
            return p
    return None


class SessionRepository:
    """Read-only access to Hermes session data in state.db."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._schema_info: dict[str, Any] = {}
        self._sessions_table: str | None = None
        self._messages_table: str | None = None
        self._fts_table: str | None = None
        self._available = False
        self._unavailable_reason: str | None = None
        self._detect_schema()

    def _detect_schema(self) -> None:
        """Detect available tables and columns in the database."""
        try:
            conn = sqlite3.connect(f"file:{self._db_path}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # List all tables
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            self._schema_info["tables"] = tables

            # Detect sessions table
            for candidate in ("sessions", "session", "conversations", "conversation"):
                if candidate in tables:
                    self._sessions_table = candidate
                    cursor.execute(f"PRAGMA table_info({candidate})")
                    self._schema_info[f"{candidate}_columns"] = [row[1] for row in cursor.fetchall()]
                    break

            # Detect messages table
            for candidate in ("messages", "message", "turns", "turn"):
                if candidate in tables:
                    self._messages_table = candidate
                    cursor.execute(f"PRAGMA table_info({candidate})")
                    self._schema_info[f"{candidate}_columns"] = [row[1] for row in cursor.fetchall()]
                    break

            # Detect FTS table
            for candidate in ("messages_fts", "fts_messages", "sessions_fts", "fts"):
                if candidate in tables:
                    self._fts_table = candidate
                    break

            # Check if we can actually read
            if self._sessions_table:
                cursor.execute(f"SELECT COUNT(*) FROM {self._sessions_table}")  # noqa: S608
                count = cursor.fetchone()[0]
                self._schema_info["session_count"] = count
                self._available = True
            else:
                self._unavailable_reason = "No sessions table found in state.db"
                self._available = False

            conn.close()

        except sqlite3.OperationalError as e:
            self._unavailable_reason = f"SQLite error: {e}"
            self._available = False
            logger.warning("Failed to detect schema: %s", e)
        except Exception as e:
            self._unavailable_reason = f"Unexpected error: {e}"
            self._available = False
            logger.warning("Failed to detect schema: %s", e)

    @property
    def available(self) -> bool:
        return self._available

    @property
    def unavailable_reason(self) -> str | None:
        return self._unavailable_reason

    @property
    def session_count(self) -> int:
        count = self._schema_info.get("session_count", 0)
        return count if isinstance(count, int) else 0

    @property
    def source(self) -> str:
        return "hermes_state_db" if self._available else "unavailable"

    def get_status(self) -> dict[str, Any]:
        """Return repository status for health/bootstrap."""
        return {
            "available": self._available,
            "source": self.source,
            "db_path": str(self._db_path.name) if self._db_path else None,
            "session_count": self.session_count,
            "sessions_table": self._sessions_table,
            "messages_table": self._messages_table,
            "fts_table": self._fts_table,
            "unavailable_reason": self._unavailable_reason,
        }

    def list_sessions(self, limit: int = 50, offset: int = 0) -> dict[str, Any]:
        """List sessions from state.db.

        Returns:
            {"sessions": [...], "total": N, "source": "hermes_state_db"}
        """
        if not self._available or not self._sessions_table:
            return {"sessions": [], "total": 0, "source": "unavailable", "reason": self._unavailable_reason}

        try:
            conn = sqlite3.connect(f"file:{self._db_path}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            columns = self._schema_info.get(f"{self._sessions_table}_columns", [])

            # Build a safe SELECT based on available columns
            select_cols = self._build_session_select(columns)
            safe_table = _validate_sql_identifier(self._sessions_table, "table")
            cursor.execute(f"SELECT {select_cols} FROM {safe_table} ORDER BY rowid DESC LIMIT ? OFFSET ?", (limit, offset))  # noqa: S608
            rows = cursor.fetchall()

            total = self.session_count

            sessions = [self._row_to_session(row, columns) for row in rows]

            conn.close()
            return {"sessions": sessions, "total": total, "source": "hermes_state_db"}

        except sqlite3.OperationalError as e:
            logger.warning("Failed to list sessions: %s", e)
            return {"sessions": [], "total": 0, "source": "unavailable", "reason": str(e)}

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        """Get a single session with optional transcript preview.

        Returns:
            Session dict with transcript_preview if messages table exists, or None if not found.
        """
        if not self._available or not self._sessions_table:
            return None

        try:
            conn = sqlite3.connect(f"file:{self._db_path}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            columns = self._schema_info.get(f"{self._sessions_table}_columns", [])
            id_col = self._find_column(columns, ["id", "session_id", "uuid", "key"])

            if not id_col:
                conn.close()
                return None

            select_cols = self._build_session_select(columns)
            safe_table = _validate_sql_identifier(self._sessions_table, "table")
            safe_id_col = _validate_sql_identifier(id_col, "column")
            cursor.execute(f"SELECT {select_cols} FROM {safe_table} WHERE {safe_id_col} = ?", (session_id,))  # noqa: S608
            row = cursor.fetchone()

            if not row:
                conn.close()
                return None

            session = self._row_to_session(row, columns)

            # Try to load transcript preview
            if self._messages_table:
                msg_columns = self._schema_info.get(f"{self._messages_table}_columns", [])
                session["transcript_preview"] = self._get_transcript_preview(
                    conn, session_id, msg_columns
                )

            conn.close()
            return session

        except sqlite3.OperationalError as e:
            logger.warning("Failed to get session %s: %s", session_id, e)
            return None

    def search_sessions(self, query: str, limit: int = 20) -> dict[str, Any]:
        """Search sessions by title or content.

        Uses FTS if available, otherwise simple LIKE fallback.
        """
        if not self._available or not self._sessions_table:
            return {"sessions": [], "total": 0, "source": "unavailable"}

        try:
            conn = sqlite3.connect(f"file:{self._db_path}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            columns = self._schema_info.get(f"{self._sessions_table}_columns", [])
            select_cols = self._build_session_select(columns)

            # Try FTS first
            if self._fts_table:
                try:
                    title_col = self._find_column(columns, ["title", "name", "subject"])
                    if title_col:
                        safe_table = _validate_sql_identifier(self._sessions_table, "table")
                        safe_title_col = _validate_sql_identifier(title_col, "column")
                        cursor.execute(
                            f"SELECT {select_cols} FROM {safe_table} WHERE {safe_title_col} MATCH ? LIMIT ?",  # noqa: S608
                            (query, limit),
                        )
                        rows = cursor.fetchall()
                        conn.close()
                        return {"sessions": [self._row_to_session(r, columns) for r in rows], "total": len(rows), "source": "hermes_state_db"}
                except sqlite3.OperationalError:
                    pass  # FTS query failed, fall back to LIKE

            # LIKE fallback
            title_col = self._find_column(columns, ["title", "name", "subject"])
            if title_col:
                safe_table = _validate_sql_identifier(self._sessions_table, "table")
                safe_title_col = _validate_sql_identifier(title_col, "column")
                cursor.execute(
                    f"SELECT {select_cols} FROM {safe_table} WHERE {safe_title_col} LIKE ? LIMIT ?",  # noqa: S608
                    (f"%{query}%", limit),
                )
                rows = cursor.fetchall()
                conn.close()
                return {"sessions": [self._row_to_session(r, columns) for r in rows], "total": len(rows), "source": "hermes_state_db"}

            conn.close()
            return {"sessions": [], "total": 0, "source": "hermes_state_db"}

        except sqlite3.OperationalError as e:
            logger.warning("Failed to search sessions: %s", e)
            return {"sessions": [], "total": 0, "source": "unavailable", "reason": str(e)}

    def _build_session_select(self, columns: list[str]) -> str:
        """Build a safe SELECT column list from available columns."""
        mappings = {
            "id": ["id", "session_id", "uuid", "key"],
            "title": ["title", "name", "subject"],
            "created_at": ["created_at", "created", "timestamp", "start_time"],
            "updated_at": ["updated_at", "updated", "modified_at", "last_activity"],
            "message_count": ["message_count", "num_messages", "turn_count"],
            "profile": ["profile", "profile_name", "agent"],
        }

        select_parts = []
        for target, candidates in mappings.items():
            col = self._find_column(columns, candidates)
            if col:
                select_parts.append(f"{col} AS {target}")

        if not select_parts:
            return "*"

        return ", ".join(select_parts)

    def _find_column(self, columns: list[str], candidates: list[str]) -> str | None:
        """Find the first matching column name from candidates."""
        cols_lower = {c.lower(): c for c in columns}
        for c in candidates:
            if c.lower() in cols_lower:
                return cols_lower[c.lower()]
        return None

    def _row_to_session(self, row: sqlite3.Row, columns: list[str]) -> dict[str, Any]:
        """Convert a SQLite row to a session dict."""
        d = dict(row)
        return {
            "id": str(d.get("id", "")),
            "title": str(d.get("title", "Untitled")),
            "created_at": str(d.get("created_at", "")),
            "updated_at": str(d.get("updated_at", "")),
            "message_count": int(d.get("message_count", 0)),
            "profile": str(d.get("profile", "")) or None,
        }

    def _get_transcript_preview(
        self, conn: sqlite3.Connection, session_id: str, msg_columns: list[str]
    ) -> list[dict[str, str]]:
        """Get a preview of the last few messages for a session."""
        try:
            cursor = conn.cursor()

            session_col = self._find_column(msg_columns, ["session_id", "conversation_id", "session_key"])
            role_col = self._find_column(msg_columns, ["role", "sender", "type"])
            content_col = self._find_column(msg_columns, ["content", "text", "message", "body"])

            if not session_col or not role_col or not content_col:
                return []
            if not self._messages_table:
                return []

            safe_msg_table = _validate_sql_identifier(self._messages_table, "table")
            safe_session_col = _validate_sql_identifier(session_col, "column")
            safe_role_col = _validate_sql_identifier(role_col, "column")
            safe_content_col = _validate_sql_identifier(content_col, "column")
            cursor.execute(
                f"SELECT {safe_role_col} AS role, {safe_content_col} AS content "  # noqa: S608
                f"FROM {safe_msg_table} "
                f"WHERE {safe_session_col} = ? "
                f"ORDER BY rowid DESC LIMIT 5",
                (session_id,),
            )
            rows = cursor.fetchall()

            return [{"role": str(r["role"] or ""), "content": str(r["content"] or "")} for r in reversed(rows)]

        except Exception as e:
            logger.warning("Failed to get transcript preview: %s", e)
            return []
