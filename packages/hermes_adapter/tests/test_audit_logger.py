"""Tests for the audit_logger module."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from hermes_adapter.audit_logger import AuditLogger, configure_audit_logger, get_audit_logger


class TestAuditLogger:
    def test_creates_table_and_inserts(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "test.db")
        logger = AuditLogger(db_path)
        logger.log("write", "test_actor", resource="test_table", detail={"action": "insert"})

        conn = sqlite3.connect(db_path)
        try:
            rows = conn.execute("SELECT event_type, actor, resource FROM audit_log").fetchall()
            assert len(rows) == 1
            assert rows[0] == ("write", "test_actor", "test_table")
        finally:
            conn.close()

    def test_log_write_convenience(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "test.db")
        logger = AuditLogger(db_path)
        logger.log_write("actor1", "kanban_cards")

        conn = sqlite3.connect(db_path)
        try:
            rows = conn.execute("SELECT event_type FROM audit_log").fetchall()
            assert rows[0][0] == "write"
        finally:
            conn.close()

    def test_log_auth_convenience(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "test.db")
        logger = AuditLogger(db_path)
        logger.log_auth("user:127.0.0.1", True)
        logger.log_auth("user:127.0.0.1", False)

        conn = sqlite3.connect(db_path)
        try:
            rows = conn.execute("SELECT detail_json FROM audit_log ORDER BY timestamp").fetchall()
            assert '"success": true' in rows[0][0]
            assert '"success": false' in rows[1][0]
        finally:
            conn.close()

    def test_log_config_change(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "test.db")
        logger = AuditLogger(db_path)
        logger.log_config_change("admin", "config.yaml", {"key": "provider"})

        conn = sqlite3.connect(db_path)
        try:
            rows = conn.execute("SELECT event_type, resource FROM audit_log").fetchall()
            assert rows[0] == ("config_change", "config.yaml")
        finally:
            conn.close()

    def test_log_secret_access(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "test.db")
        logger = AuditLogger(db_path)
        logger.log_secret_access("system", ".env")

        conn = sqlite3.connect(db_path)
        try:
            rows = conn.execute("SELECT event_type, resource FROM audit_log").fetchall()
            assert rows[0] == ("secret_access", ".env")
        finally:
            conn.close()

    def test_log_redaction(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "test.db")
        logger = AuditLogger(db_path)
        logger.log_redaction("kanban", "description", 42)

        conn = sqlite3.connect(db_path)
        try:
            rows = conn.execute("SELECT event_type, detail_json FROM audit_log").fetchall()
            assert rows[0][0] == "redaction"
            assert '"field": "description"' in rows[0][1]
            assert '"original_length": 42' in rows[0][1]
        finally:
            conn.close()

    def test_noop_when_db_path_is_none(self) -> None:
        logger = AuditLogger(None)
        logger.log("write", "actor")  # should not raise

    def test_survives_db_errors(self, tmp_path: Path) -> None:
        logger = AuditLogger(str(tmp_path / "nonexistent" / "dir" / "test.db"))
        logger.log("write", "actor")  # should not raise


class TestModuleLevelFunctions:
    def test_configure_and_get(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "test.db")
        logger = configure_audit_logger(db_path)
        assert get_audit_logger() is logger

    def test_get_returns_none_before_configure(self) -> None:
        # Reset
        import hermes_adapter.audit_logger as mod
        mod._default_logger = None
        assert get_audit_logger() is None
