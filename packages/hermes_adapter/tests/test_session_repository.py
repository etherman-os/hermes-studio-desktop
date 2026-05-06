"""Tests for session repository — read-only Hermes state.db access."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from hermes_adapter.session_repository import SessionRepository, find_state_db, get_hermes_home


@pytest.fixture()
def fixture_db(tmp_path: Path) -> Path:
    """Create a fixture SQLite DB with a Hermes-like schema."""
    db_path = tmp_path / "state.db"
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Create sessions table
    cursor.execute("""
        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT,
            updated_at TEXT,
            message_count INTEGER,
            profile TEXT
        )
    """)

    # Create messages table
    cursor.execute("""
        CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            role TEXT,
            content TEXT,
            created_at TEXT
        )
    """)

    # Insert test sessions
    cursor.execute(
        "INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)",
        ("s-1", "Map src directory", "2026-05-06T10:00:00Z", "2026-05-06T10:05:00Z", 12, "coder"),
    )
    cursor.execute(
        "INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)",
        ("s-2", "Review API contracts", "2026-05-06T09:00:00Z", "2026-05-06T09:30:00Z", 24, "coder"),
    )
    cursor.execute(
        "INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)",
        ("s-3", "Theme loader bug", "2026-05-05T14:00:00Z", "2026-05-05T15:20:00Z", 18, "research"),
    )

    # Insert test messages for s-1
    cursor.execute(
        "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        ("s-1", "user", "Can you map the src directory?", "2026-05-06T10:00:00Z"),
    )
    cursor.execute(
        "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        ("s-1", "assistant", "I'll explore the src directory for you.", "2026-05-06T10:00:05Z"),
    )
    cursor.execute(
        "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        ("s-1", "tool", "file_tree: src/, tests/, README.md", "2026-05-06T10:00:10Z"),
    )

    conn.commit()
    conn.close()
    return db_path


@pytest.fixture()
def empty_db(tmp_path: Path) -> Path:
    """Create an empty SQLite DB (no sessions table)."""
    db_path = tmp_path / "state.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE config (key TEXT, value TEXT)")
    conn.commit()
    conn.close()
    return db_path


class TestFindStateDb:
    def test_find_in_default_location(self, tmp_path: Path) -> None:
        db = tmp_path / "state.db"
        db.touch()
        result = find_state_db(tmp_path)
        assert result == db

    def test_find_in_data_subdir(self, tmp_path: Path) -> None:
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        db = data_dir / "state.db"
        db.touch()
        result = find_state_db(tmp_path)
        assert result == db

    def test_not_found(self, tmp_path: Path) -> None:
        result = find_state_db(tmp_path)
        assert result is None


class TestSessionRepository:
    def test_init_with_valid_db(self, fixture_db: Path) -> None:
        repo = SessionRepository(fixture_db)
        assert repo.available is True
        assert repo.session_count == 3
        assert repo.source == "hermes_state_db"

    def test_init_with_empty_db(self, empty_db: Path) -> None:
        repo = SessionRepository(empty_db)
        assert repo.available is False
        assert "No sessions table" in (repo.unavailable_reason or "")

    def test_init_with_missing_db(self) -> None:
        repo = SessionRepository(Path("/nonexistent/state.db"))
        assert repo.available is False
        assert repo.unavailable_reason is not None

    def test_get_status(self, fixture_db: Path) -> None:
        repo = SessionRepository(fixture_db)
        status = repo.get_status()
        assert status["available"] is True
        assert status["source"] == "hermes_state_db"
        assert status["session_count"] == 3
        assert status["sessions_table"] == "sessions"
        assert status["messages_table"] == "messages"

    def test_list_sessions(self, fixture_db: Path) -> None:
        repo = SessionRepository(fixture_db)
        result = repo.list_sessions()
        assert result["total"] == 3
        assert len(result["sessions"]) == 3
        assert result["source"] == "hermes_state_db"

        # Check first session has correct fields
        s = result["sessions"][0]
        assert "id" in s
        assert "title" in s
        assert "message_count" in s

    def test_list_sessions_with_limit(self, fixture_db: Path) -> None:
        repo = SessionRepository(fixture_db)
        result = repo.list_sessions(limit=2)
        assert len(result["sessions"]) == 2

    def test_list_sessions_empty_db(self, empty_db: Path) -> None:
        repo = SessionRepository(empty_db)
        result = repo.list_sessions()
        assert result["sessions"] == []
        assert result["total"] == 0

    def test_get_session(self, fixture_db: Path) -> None:
        repo = SessionRepository(fixture_db)
        session = repo.get_session("s-1")
        assert session is not None
        assert session["id"] == "s-1"
        assert session["title"] == "Map src directory"
        assert session["message_count"] == 12

    def test_get_session_with_transcript(self, fixture_db: Path) -> None:
        repo = SessionRepository(fixture_db)
        session = repo.get_session("s-1")
        assert session is not None
        assert "transcript_preview" in session
        assert len(session["transcript_preview"]) > 0
        assert session["transcript_preview"][0]["role"] == "user"

    def test_get_session_not_found(self, fixture_db: Path) -> None:
        repo = SessionRepository(fixture_db)
        session = repo.get_session("nonexistent")
        assert session is None

    def test_search_sessions(self, fixture_db: Path) -> None:
        repo = SessionRepository(fixture_db)
        result = repo.search_sessions("API")
        assert len(result["sessions"]) > 0
        assert "API" in result["sessions"][0]["title"]

    def test_search_sessions_no_match(self, fixture_db: Path) -> None:
        repo = SessionRepository(fixture_db)
        result = repo.search_sessions("nonexistent_query_xyz")
        assert len(result["sessions"]) == 0

    def test_read_only_no_write(self, fixture_db: Path) -> None:
        """Verify repository never writes to the database."""
        repo = SessionRepository(fixture_db)

        # Get the file modification time before
        mtime_before = fixture_db.stat().st_mtime

        # Perform read operations
        repo.list_sessions()
        repo.get_session("s-1")
        repo.search_sessions("test")

        # File should not be modified
        mtime_after = fixture_db.stat().st_mtime
        assert mtime_before == mtime_after, "Repository wrote to the database!"


class TestSessionRepositoryWithFts:
    @pytest.fixture()
    def fts_db(self, tmp_path: Path) -> Path:
        """Create a fixture DB with FTS table."""
        db_path = tmp_path / "state.db"
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                created_at TEXT,
                updated_at TEXT,
                message_count INTEGER
            )
        """)

        cursor.execute("CREATE VIRTUAL TABLE messages_fts USING fts5(content)")

        cursor.execute(
            "INSERT INTO sessions VALUES (?, ?, ?, ?, ?)",
            ("s-1", "Test session", "2026-05-06T10:00:00Z", "2026-05-06T10:05:00Z", 5),
        )

        conn.commit()
        conn.close()
        return db_path

    def test_fts_detected(self, fts_db: Path) -> None:
        repo = SessionRepository(fts_db)
        status = repo.get_status()
        assert status["fts_table"] == "messages_fts"

    def test_search_uses_fts(self, fts_db: Path) -> None:
        repo = SessionRepository(fts_db)
        # FTS search should work (even if empty results)
        result = repo.search_sessions("test")
        assert result["source"] == "hermes_state_db"
