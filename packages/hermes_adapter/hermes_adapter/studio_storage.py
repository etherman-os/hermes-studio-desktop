"""Studio-owned SQLite storage for local Desktop Studio state.

This database belongs to Hermes Desktop Studio. It must never point at or mutate
Hermes Agent state such as ~/.hermes/state.db.
"""

from __future__ import annotations

import os
import re
import sqlite3
import sys
from collections.abc import Iterator, Mapping
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_APP_DIR_NAME = "hermes-desktop-studio"
_DB_FILENAME = "studio.db"

_SECRET_KEY_RE = re.compile(r"(?i)(api[_-]?key|token|secret|password|auth|bearer)")
_SECRET_VALUE_PATTERNS = (
    re.compile(r"Bearer\s+\S+", re.IGNORECASE),
    re.compile(r"(?i)\b(sk-|xai-|tvly-)[a-zA-Z0-9]+"),
    re.compile(r"\b[a-f0-9]{32,}\b", re.IGNORECASE),
)


class StudioStorageError(RuntimeError):
    """Raised when Studio-owned storage cannot be used safely."""


@dataclass(frozen=True)
class StudioStorageStatus:
    """Serializable storage health metadata."""

    available: bool
    schema_version: int
    data_dir: str
    db_path: str
    last_error: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "schema_version": self.schema_version,
            "data_dir": self.data_dir,
            "db_path": self.db_path,
            "last_error": self.last_error,
        }


@dataclass(frozen=True)
class _Migration:
    version: int
    name: str
    statements: tuple[str, ...]


_MIGRATIONS: tuple[_Migration, ...] = (
    _Migration(
        version=1,
        name="initial_studio_storage",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS migrations (
              version INTEGER PRIMARY KEY,
              name TEXT NOT NULL,
              applied_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS studio_meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """,
        ),
    ),
    _Migration(
        version=2,
        name="persistent_kanban",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS boards (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS columns (
              id TEXT PRIMARY KEY,
              board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
              name TEXT NOT NULL,
              semantic_status TEXT NOT NULL,
              position INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS cards (
              id TEXT PRIMARY KEY,
              board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
              column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
              title TEXT NOT NULL,
              description TEXT NOT NULL,
              priority TEXT NOT NULL,
              status TEXT NOT NULL,
              position INTEGER NOT NULL,
              session_id TEXT,
              run_id TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              archived_at TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS card_events (
              id TEXT PRIMARY KEY,
              card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
              type TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_columns_board_position ON columns(board_id, position)",
            "CREATE INDEX IF NOT EXISTS idx_cards_board_column_position ON cards(board_id, column_id, position)",
            "CREATE INDEX IF NOT EXISTS idx_cards_archived_at ON cards(archived_at)",
            "CREATE INDEX IF NOT EXISTS idx_card_events_card_created ON card_events(card_id, created_at)",
        ),
    ),
)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _same_path(left: Path, right: Path) -> bool:
    try:
        return left.expanduser().resolve(strict=False) == right.expanduser().resolve(strict=False)
    except OSError:
        return left.expanduser().absolute() == right.expanduser().absolute()


def _is_hermes_state_db_path(path: Path) -> bool:
    expanded = path.expanduser()
    if _same_path(expanded, Path.home() / ".hermes" / "state.db"):
        return True
    return expanded.name == "state.db" and ".hermes" in expanded.parts


def _platform_user_data_dir(env: Mapping[str, str] | None = None) -> Path:
    values = env or os.environ
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / _APP_DIR_NAME
    if sys.platform.startswith("win"):
        appdata = values.get("APPDATA")
        if appdata:
            return Path(appdata).expanduser() / _APP_DIR_NAME
        return Path.home() / "AppData" / "Roaming" / _APP_DIR_NAME

    xdg_data_home = values.get("XDG_DATA_HOME")
    if xdg_data_home:
        return Path(xdg_data_home).expanduser() / _APP_DIR_NAME
    return Path.home() / ".local" / "share" / _APP_DIR_NAME


def resolve_studio_paths(env: Mapping[str, str] | None = None) -> tuple[Path, Path]:
    """Resolve the Studio data directory and SQLite database path."""
    values = env or os.environ
    db_override = values.get("HERMES_STUDIO_DB_PATH")
    if db_override:
        db_path = Path(db_override).expanduser()
        return db_path.parent, db_path

    home_override = values.get("HERMES_STUDIO_HOME")
    data_dir = Path(home_override).expanduser() if home_override else _platform_user_data_dir(values)
    return data_dir, data_dir / _DB_FILENAME


def _validate_db_path(db_path: Path) -> None:
    if _is_hermes_state_db_path(db_path):
        raise StudioStorageError("HERMES_STUDIO_DB_PATH must not point to Hermes state.db")
    if db_path.name != _DB_FILENAME:
        raise StudioStorageError(f"HERMES_STUDIO_DB_PATH must point to {_DB_FILENAME}")


def _ensure_non_secret_meta(key: str, value: str) -> None:
    if _SECRET_KEY_RE.search(key):
        raise StudioStorageError("studio_meta refuses secret-like keys")
    if any(pattern.search(value) for pattern in _SECRET_VALUE_PATTERNS):
        raise StudioStorageError("studio_meta refuses secret-like values")


class StudioStorage:
    """Small SQLite migration and metadata facade for Studio-owned state."""

    def __init__(self, data_dir: Path | None = None, db_path: Path | None = None) -> None:
        if data_dir is None and db_path is None:
            self.data_dir, self.db_path = resolve_studio_paths()
        elif db_path is None:
            assert data_dir is not None
            self.data_dir = data_dir
            self.db_path = data_dir / _DB_FILENAME
        else:
            self.db_path = db_path
            self.data_dir = data_dir or self.db_path.parent
        self._status = StudioStorageStatus(
            available=False,
            schema_version=0,
            data_dir=str(self.data_dir),
            db_path=str(self.db_path),
            last_error="Storage not initialized",
        )

    def initialize(self) -> StudioStorageStatus:
        """Create the data directory, open the database, and run migrations."""
        try:
            _validate_db_path(self.db_path)
            self.data_dir.mkdir(parents=True, exist_ok=True)
            with suppress(OSError):
                self.data_dir.chmod(0o700)

            conn = sqlite3.connect(self.db_path)
            try:
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA foreign_keys = ON")
                self._run_migrations(conn)
                schema_version = self._read_schema_version(conn)
                conn.commit()
            finally:
                conn.close()

            self._status = StudioStorageStatus(
                available=True,
                schema_version=schema_version,
                data_dir=str(self.data_dir),
                db_path=str(self.db_path),
                last_error=None,
            )
        except (OSError, sqlite3.DatabaseError, StudioStorageError) as exc:
            self._status = StudioStorageStatus(
                available=False,
                schema_version=0,
                data_dir=str(self.data_dir),
                db_path=str(self.db_path),
                last_error=str(exc),
            )
        return self._status

    def status(self) -> StudioStorageStatus:
        """Return current status, initializing if needed."""
        if self._status.last_error == "Storage not initialized":
            return self.initialize()
        return self._status

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        """Yield a migrated SQLite connection for Studio-owned data."""
        status = self.initialize()
        if not status.available:
            raise StudioStorageError(status.last_error or "Studio storage unavailable")

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def get_schema_version(self) -> int:
        """Return the current schema version."""
        with self.connect() as conn:
            return self._read_schema_version(conn)

    def get_meta(self, key: str) -> str | None:
        """Read a non-secret Studio metadata value."""
        with self.connect() as conn:
            row = conn.execute("SELECT value FROM studio_meta WHERE key = ?", (key,)).fetchone()
            return str(row["value"]) if row else None

    def set_meta(self, key: str, value: str) -> None:
        """Write a non-secret Studio metadata value."""
        _ensure_non_secret_meta(key, value)
        with self.connect() as conn:
            self._set_meta(conn, key, value)

    def _run_migrations(self, conn: sqlite3.Connection) -> None:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS migrations (
              version INTEGER PRIMARY KEY,
              name TEXT NOT NULL,
              applied_at TEXT NOT NULL
            )
            """
        )
        applied = {
            int(row["version"])
            for row in conn.execute("SELECT version FROM migrations").fetchall()
        }
        for migration in _MIGRATIONS:
            if migration.version in applied:
                continue
            for statement in migration.statements:
                conn.execute(statement)
            applied_at = _now_iso()
            conn.execute(
                "INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)",
                (migration.version, migration.name, applied_at),
            )
            self._set_meta(conn, "initialized_at", applied_at)
            self._set_meta(conn, "storage_owner", "hermes-desktop-studio")

        self._set_meta(conn, "schema_version", str(_MIGRATIONS[-1].version))

    @staticmethod
    def _set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
        conn.execute(
            """
            INSERT INTO studio_meta (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at
            """,
            (key, value, _now_iso()),
        )

    @staticmethod
    def _read_schema_version(conn: sqlite3.Connection) -> int:
        row = conn.execute("SELECT value FROM studio_meta WHERE key = 'schema_version'").fetchone()
        if row:
            try:
                return int(row["value"])
            except (TypeError, ValueError):
                return 0
        row = conn.execute("SELECT MAX(version) AS version FROM migrations").fetchone()
        return int(row["version"] or 0) if row else 0


def get_studio_storage_status() -> dict[str, Any]:
    """Return serializable Studio storage health metadata."""
    return StudioStorage().initialize().to_dict()
