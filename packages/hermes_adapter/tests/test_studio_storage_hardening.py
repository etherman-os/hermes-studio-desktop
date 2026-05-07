"""Tests for studio_storage hardening features."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from hermes_adapter.studio_storage import StudioStorage


class TestIntegrityCheck:
    def test_passes_for_valid_db(self, tmp_path: Path) -> None:
        storage = StudioStorage(data_dir=tmp_path / "data")
        status = storage.initialize()
        assert status.available is True
        assert status.integrity_ok is True

    def test_fails_for_corrupt_db(self, tmp_path: Path) -> None:
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        db_path = data_dir / "studio.db"
        db_path.write_bytes(b"not a database at all" * 100)

        storage = StudioStorage(data_dir=data_dir, db_path=db_path)
        status = storage.initialize()
        assert status.available is False
        assert status.integrity_ok is False


class TestWalMode:
    def test_enables_wal_mode(self, tmp_path: Path) -> None:
        storage = StudioStorage(data_dir=tmp_path / "data")
        storage.initialize()

        conn = sqlite3.connect(storage.db_path)
        try:
            mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
            assert mode == "wal"
        finally:
            conn.close()


class TestBackupRotation:
    def test_creates_backup_before_migration(self, tmp_path: Path) -> None:
        storage = StudioStorage(data_dir=tmp_path / "data")
        storage.initialize()

        # Check that at least one backup was created (from the initial migration)
        backups = list((tmp_path / "data").glob("studio.db.bak.*"))
        assert len(backups) >= 1

    def test_manual_backup(self, tmp_path: Path) -> None:
        storage = StudioStorage(data_dir=tmp_path / "data")
        storage.initialize()

        backup_path = storage.backup_database()
        assert backup_path is not None
        assert backup_path.exists()

    def test_backup_rotation_limits_count(self, tmp_path: Path) -> None:
        storage = StudioStorage(data_dir=tmp_path / "data")
        storage.initialize()

        # Create several backups
        for _ in range(5):
            storage.backup_database()

        backups = list((tmp_path / "data").glob("studio.db.bak.*"))
        assert len(backups) <= 3  # _BACKUP_COUNT


class TestMigrationRollback:
    def test_rollback_finds_matching_backup(self, tmp_path: Path) -> None:
        storage = StudioStorage(data_dir=tmp_path / "data")
        status = storage.initialize()
        current_version = status.schema_version

        # Backup the current state
        storage.backup_database()

        # Rollback to current version should succeed
        result = storage.rollback_migration(current_version)
        assert result is True

    def test_rollback_fails_when_no_backup(self, tmp_path: Path) -> None:
        storage = StudioStorage(data_dir=tmp_path / "data")
        storage.initialize()

        result = storage.rollback_migration(999)
        assert result is False


class TestAuditLogMigration:
    def test_schema_version_8_includes_tool_packs(self, tmp_path: Path) -> None:
        storage = StudioStorage(data_dir=tmp_path / "data")
        status = storage.initialize()
        assert status.schema_version == 8

        with storage.connect() as conn:
            tables = {
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
        assert "audit_log" in tables
