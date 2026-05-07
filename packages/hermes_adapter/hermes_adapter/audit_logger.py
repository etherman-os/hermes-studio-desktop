"""Audit logging for the Hermes Desktop Studio adapter.

Records write operations, auth events, config changes, and sensitive-data
access into the ``audit_log`` table in studio.db.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("hermes_adapter.audit_logger")

# Table is created lazily on first write.

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    resource TEXT,
    detail_json TEXT,
    ip_address TEXT
)
"""

_INSERT_SQL = """
INSERT INTO audit_log (id, timestamp, event_type, actor, resource, detail_json, ip_address)
VALUES (?, ?, ?, ?, ?, ?, ?)
"""


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class AuditLogger:
    """Writes audit entries into studio.db via a lightweight connection."""

    def __init__(self, db_path: str | None = None) -> None:
        self._db_path = db_path
        self._initialised = False

    def _ensure_table(self, conn: Any) -> None:
        if self._initialised:
            return
        conn.execute(_CREATE_TABLE_SQL)
        conn.commit()
        self._initialised = True

    def log(
        self,
        event_type: str,
        actor: str,
        resource: str | None = None,
        detail: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> None:
        """Insert an audit record.

        Parameters
        ----------
        event_type:
            One of ``write``, ``auth``, ``config_change``, ``secret_access``,
            ``redaction``, ``migration``, etc.
        actor:
            Identifier for the actor (e.g. ``"system"``, ``"user:ip"``).
        resource:
            Target resource (table name, file path, etc.).
        detail:
            Arbitrary JSON-serialisable detail dict.
        ip_address:
            Remote IP if applicable.
        """
        if self._db_path is None:
            logger.debug("Audit logger has no db_path; skipping entry")
            return

        import sqlite3

        try:
            conn = sqlite3.connect(self._db_path)
            try:
                self._ensure_table(conn)
                conn.execute(
                    _INSERT_SQL,
                    (
                        uuid.uuid4().hex,
                        _now_iso(),
                        event_type,
                        actor,
                        resource,
                        json.dumps(detail, default=str) if detail else None,
                        ip_address,
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        except Exception:
            logger.warning("Failed to write audit entry", exc_info=True)

    # Convenience helpers ------------------------------------------------

    def log_write(self, actor: str, resource: str, detail: dict[str, Any] | None = None) -> None:
        self.log("write", actor, resource, detail)

    def log_auth(self, actor: str, success: bool, detail: dict[str, Any] | None = None) -> None:
        merged = {"success": success}
        if detail:
            merged.update(detail)
        self.log("auth", actor, detail=merged)

    def log_config_change(self, actor: str, resource: str, detail: dict[str, Any] | None = None) -> None:
        self.log("config_change", actor, resource, detail)

    def log_secret_access(self, actor: str, resource: str, detail: dict[str, Any] | None = None) -> None:
        self.log("secret_access", actor, resource, detail)

    def log_redaction(self, source: str, field: str, original_length: int) -> None:
        self.log(
            "redaction",
            actor="system",
            resource=source,
            detail={"field": field, "original_length": original_length},
        )


# Module-level singleton used by convenience functions.
_default_logger: AuditLogger | None = None


def configure_audit_logger(db_path: str | None) -> AuditLogger:
    """Create and return the module-level ``AuditLogger`` singleton."""
    global _default_logger
    _default_logger = AuditLogger(db_path)
    return _default_logger


def get_audit_logger() -> AuditLogger | None:
    """Return the current audit logger (may be ``None`` if not configured)."""
    return _default_logger
