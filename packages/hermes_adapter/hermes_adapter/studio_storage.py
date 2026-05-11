"""Studio-owned SQLite storage for local Desktop Studio state.

This database belongs to Hermes Desktop Studio. It must never point at or mutate
Hermes Agent state such as ~/.hermes/state.db.

Hardened with:
- WAL mode for better concurrent access
- PRAGMA integrity_check on startup
- Backup rotation (last 3 backups)
- Migration rollback capability
"""

from __future__ import annotations

import logging
import threading
import os
import re
import shutil
import sqlite3
import sys
from collections.abc import Iterator, Mapping
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger("hermes_adapter.studio_storage")

_APP_DIR_NAME = "hermes-desktop-studio"
_DB_FILENAME = "studio.db"
_BACKUP_COUNT = 3

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
    integrity_ok: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "schema_version": self.schema_version,
            "data_dir": self.data_dir,
            "db_path": self.db_path,
            "last_error": self.last_error,
            "integrity_ok": self.integrity_ok,
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
    _Migration(
        version=3,
        name="persistent_run_ledger",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS runs (
              id TEXT PRIMARY KEY,
              session_id TEXT,
              status TEXT NOT NULL,
              title TEXT,
              prompt_preview TEXT,
              started_at TEXT NOT NULL,
              completed_at TEXT,
              duration_ms INTEGER,
              backend TEXT NOT NULL,
              model TEXT,
              error TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS run_events (
              id TEXT PRIMARY KEY,
              run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
              type TEXT NOT NULL,
              source TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              timestamp TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at)",
            "CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)",
            "CREATE INDEX IF NOT EXISTS idx_run_events_run_timestamp ON run_events(run_id, timestamp, id)",
            "CREATE INDEX IF NOT EXISTS idx_run_events_type ON run_events(type)",
        ),
    ),
    _Migration(
        version=4,
        name="run_workspace_metadata",
        statements=(
            "ALTER TABLE runs ADD COLUMN workspace_path TEXT",
        ),
    ),
    _Migration(
        version=5,
        name="persistent_artifacts",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS artifacts (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              type TEXT NOT NULL,
              description TEXT,
              content_text TEXT,
              file_path TEXT,
              mime_type TEXT,
              size_bytes INTEGER,
              run_id TEXT,
              session_id TEXT,
              kanban_card_id TEXT,
              source TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              archived_at TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS artifact_events (
              id TEXT PRIMARY KEY,
              artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
              type TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type)",
            "CREATE INDEX IF NOT EXISTS idx_artifacts_run_id ON artifacts(run_id)",
            "CREATE INDEX IF NOT EXISTS idx_artifacts_session_id ON artifacts(session_id)",
            "CREATE INDEX IF NOT EXISTS idx_artifacts_card_id ON artifacts(kanban_card_id)",
            "CREATE INDEX IF NOT EXISTS idx_artifacts_archived_at ON artifacts(archived_at)",
            "CREATE INDEX IF NOT EXISTS idx_artifact_events_artifact_created ON artifact_events(artifact_id, created_at)",
        ),
    ),
    _Migration(
        version=6,
        name="persistent_approvals",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS approvals (
              id TEXT PRIMARY KEY,
              run_id TEXT,
              session_id TEXT,
              tool_name TEXT,
              command TEXT,
              risk_level TEXT NOT NULL,
              status TEXT NOT NULL,
              reason TEXT,
              request_payload_json TEXT,
              decision TEXT,
              decided_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS approval_events (
              id TEXT PRIMARY KEY,
              approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
              type TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)",
            "CREATE INDEX IF NOT EXISTS idx_approvals_risk_level ON approvals(risk_level)",
            "CREATE INDEX IF NOT EXISTS idx_approvals_run_id ON approvals(run_id)",
            "CREATE INDEX IF NOT EXISTS idx_approvals_session_id ON approvals(session_id)",
            "CREATE INDEX IF NOT EXISTS idx_approval_events_approval_created ON approval_events(approval_id, created_at)",
        ),
    ),
    _Migration(
        version=7,
        name="audit_log_table",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
              id TEXT PRIMARY KEY,
              timestamp TEXT NOT NULL,
              event_type TEXT NOT NULL,
              actor TEXT NOT NULL,
              resource TEXT,
              detail_json TEXT,
              ip_address TEXT
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)",
            "CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type)",
        ),
    ),
    _Migration(
        version=8,
        name="tool_packs",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS tool_packs (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              version TEXT NOT NULL,
              author TEXT NOT NULL,
              description TEXT,
              manifest_json TEXT NOT NULL,
              source_path TEXT NOT NULL,
              enabled INTEGER NOT NULL DEFAULT 0,
              trusted INTEGER NOT NULL DEFAULT 0,
              installed_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_tool_packs_enabled ON tool_packs(enabled)",
            "CREATE INDEX IF NOT EXISTS idx_tool_packs_trusted ON tool_packs(trusted)",
        ),
    ),
    _Migration(
        version=9,
        name="artifact_revisions",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS artifact_revisions (
              id TEXT PRIMARY KEY,
              artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
              version INTEGER NOT NULL,
              title TEXT NOT NULL,
              type TEXT NOT NULL,
              description TEXT,
              content_text TEXT,
              file_path TEXT,
              mime_type TEXT,
              size_bytes INTEGER,
              source TEXT NOT NULL,
              event_type TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """,
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_artifact_revisions_artifact_version ON artifact_revisions(artifact_id, version)",
            "CREATE INDEX IF NOT EXISTS idx_artifact_revisions_artifact_created ON artifact_revisions(artifact_id, created_at)",
        ),
    ),
    _Migration(
        version=10,
        name="artifact_variants",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS artifact_variant_groups (
              id TEXT PRIMARY KEY,
              source_artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
              title TEXT NOT NULL,
              brief TEXT,
              status TEXT NOT NULL,
              winner_variant_id TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS artifact_variants (
              id TEXT PRIMARY KEY,
              group_id TEXT NOT NULL REFERENCES artifact_variant_groups(id) ON DELETE CASCADE,
              label TEXT NOT NULL,
              title TEXT NOT NULL,
              content_text TEXT,
              file_path TEXT,
              mime_type TEXT,
              size_bytes INTEGER,
              rationale TEXT,
              score INTEGER,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_artifact_variant_groups_source ON artifact_variant_groups(source_artifact_id, updated_at)",
            "CREATE INDEX IF NOT EXISTS idx_artifact_variants_group ON artifact_variants(group_id, created_at)",
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


# ---------------------------------------------------------------------------
# Backup rotation
# ---------------------------------------------------------------------------


def _rotate_backups(db_path: Path) -> None:
    """Keep the last ``_BACKUP_COUNT`` backups of *db_path*."""
    parent = db_path.parent
    stem = db_path.name
    backups = sorted(
        parent.glob(f"{stem}.bak.*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    # Remove old backups beyond the limit
    for old in backups[_BACKUP_COUNT - 1 :]:
        with suppress(OSError):
            old.unlink()


def _create_backup(db_path: Path) -> Path | None:
    """Create a numbered backup of *db_path* before migration. Returns the backup path."""
    if not db_path.exists():
        return None
    parent = db_path.parent
    stem = db_path.name
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    backup_path = parent / f"{stem}.bak.{timestamp}"
    try:
        shutil.copy2(db_path, backup_path)
        _rotate_backups(db_path)
        return backup_path
    except OSError:
        return None


# ---------------------------------------------------------------------------
# WAL mode helper
# ---------------------------------------------------------------------------


def _enable_wal(conn: sqlite3.Connection) -> None:
    """Enable WAL journal mode for better concurrent access."""
    try:
        mode = conn.execute("PRAGMA journal_mode").fetchone()
        if mode and mode[0] != "wal":
            conn.execute("PRAGMA journal_mode = WAL")
    except sqlite3.DatabaseError:
        pass


# ---------------------------------------------------------------------------
# Integrity check
# ---------------------------------------------------------------------------


def _check_integrity(conn: sqlite3.Connection) -> bool:
    """Run ``PRAGMA integrity_check`` and return ``True`` if the DB is healthy."""
    try:
        result = conn.execute("PRAGMA integrity_check").fetchone()
        return bool(result and result[0] == "ok")
    except sqlite3.DatabaseError:
        return False


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------


class StudioStorage:
    """Small SQLite migration and metadata facade for Studio-owned state."""

    def __init__(self, data_dir: Path | None = None, db_path: Path | None = None) -> None:
        if data_dir is None and db_path is None:
            self.data_dir, self.db_path = resolve_studio_paths()
        elif db_path is None:
            if data_dir is None:
                raise ValueError("data_dir is required when db_path is not provided")
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
        self._cached_conn: sqlite3.Connection | None = None
        self._conn_lock = threading.Lock()

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
                _enable_wal(conn)

                # Integrity check
                integrity_ok = _check_integrity(conn)
                if not integrity_ok:
                    raise StudioStorageError("Database integrity check failed")

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
                integrity_ok=True,
            )
        except (OSError, sqlite3.DatabaseError, StudioStorageError) as exc:
            logger.warning("StudioStorage.initialize failed: %s", exc)
            self._status = StudioStorageStatus(
                available=False,
                schema_version=0,
                data_dir=str(self.data_dir),
                db_path=str(self.db_path),
                last_error=str(exc),
                integrity_ok=False,
            )
        return self._status

    def status(self) -> StudioStorageStatus:
        """Return current status, initializing if needed."""
        if self._status.last_error == "Storage not initialized":
            return self.initialize()
        return self._status

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        """Yield a migrated SQLite connection for Studio-owned data.

        Reuses a cached connection when possible.  Each call still commits
        on success and rolls back on failure, but avoids the overhead of
        re-opening the file for every operation.

        The connection is checked out under a lock and held for the duration
        of the context manager to prevent concurrent use of the same connection,
        which would cause SQLite busy-timeout or write conflicts.
        """
        status = self.initialize()
        if not status.available:
            raise StudioStorageError(status.last_error or "Studio storage unavailable")

        with self._conn_lock:
            if self._cached_conn is not None:
                try:
                    self._cached_conn.execute("SELECT 1")
                except sqlite3.DatabaseError:
                    with suppress(sqlite3.DatabaseError):
                        self._cached_conn.close()
                    self._cached_conn = None

            if self._cached_conn is None:
                conn = sqlite3.connect(self.db_path)
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA foreign_keys = ON")
                _enable_wal(conn)
                self._cached_conn = conn
            else:
                conn = self._cached_conn

            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise

    def close(self) -> None:
        """Close the cached connection if open."""
        if self._cached_conn is not None:
            with suppress(sqlite3.DatabaseError):
                self._cached_conn.close()
            self._cached_conn = None

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

    def backup_database(self) -> Path | None:
        """Create a manual backup of the database. Returns backup path or ``None``."""
        return _create_backup(self.db_path)

    def rollback_migration(self, target_version: int) -> bool:
        """Roll back to *target_version* by restoring from the most recent backup.

        Note: This restores the entire database file from backup. True
        incremental migration rollback is not supported; this is a
        disaster-recovery helper.

        Returns ``True`` if rollback succeeded.
        """
        parent = self.db_path.parent
        stem = self.db_path.name
        backups = sorted(
            parent.glob(f"{stem}.bak.*"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for backup in backups:
            try:
                # Quick check: does the backup contain the target version?
                conn = sqlite3.connect(backup)
                conn.row_factory = sqlite3.Row
                try:
                    row = conn.execute(
                        "SELECT value FROM studio_meta WHERE key = 'schema_version'"
                    ).fetchone()
                    if row and int(row["value"]) == target_version:
                        conn.close()
                        shutil.copy2(backup, self.db_path)
                        # Reset cached connection to avoid stale handle after restore
                        with self._conn_lock:
                            if self._cached_conn is not None:
                                with suppress(sqlite3.DatabaseError):
                                    self._cached_conn.close()
                                self._cached_conn = None
                        return True
                finally:
                    conn.close()
            except (sqlite3.DatabaseError, OSError, ValueError):
                continue
        return False

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

        # Create backup before applying new migrations
        pending = [m for m in _MIGRATIONS if m.version not in applied]
        if pending:
            _create_backup(self.db_path)

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
