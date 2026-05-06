"""Tests for Studio-owned Kanban persistence."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import pytest

from hermes_adapter.kanban_repository import KanbanRepository
from hermes_adapter.studio_storage import StudioStorage


def _repo(tmp_path: Path) -> KanbanRepository:
    return KanbanRepository(StudioStorage(data_dir=tmp_path / "studio-data"))


def _column(board: dict[str, Any], name: str) -> dict[str, Any]:
    for column in board["columns"]:
        if column["name"] == name:
            return column
    raise AssertionError(f"Column {name!r} not found")


def _event_rows(storage: StudioStorage, card_id: str) -> list[tuple[str, str]]:
    with sqlite3.connect(storage.db_path) as conn:
        return conn.execute(
            "SELECT type, payload_json FROM card_events WHERE card_id = ? ORDER BY created_at, id",
            (card_id,),
        ).fetchall()


def test_default_board_creation(tmp_path: Path) -> None:
    board = _repo(tmp_path).get_default_board()

    assert board["id"] == "board_default"
    assert board["name"] == "Default Board"
    assert board["card_count"] == 0


def test_default_columns_creation(tmp_path: Path) -> None:
    board = _repo(tmp_path).get_default_board()

    assert [column["name"] for column in board["columns"]] == [
        "Inbox",
        "Ready",
        "Doing",
        "Blocked",
        "Done",
    ]
    assert [column["semantic_status"] for column in board["columns"]] == [
        "inbox",
        "ready",
        "doing",
        "blocked",
        "done",
    ]


def test_create_card(tmp_path: Path) -> None:
    card = _repo(tmp_path).create_card(
        {"title": "Write tests", "description": "Cover repository operations", "priority": "high"}
    )

    assert card["id"].startswith("card_")
    assert card["board_id"] == "board_default"
    assert card["title"] == "Write tests"
    assert card["description"] == "Cover repository operations"
    assert card["priority"] == "high"
    assert card["status"] == "inbox"
    assert card["archived_at"] is None


def test_update_card(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    card = repo.create_card({"title": "Initial"})

    updated = repo.update_card(
        card["id"],
        {"title": "Updated", "description": "New detail", "priority": "medium", "status": "ready"},
    )

    assert updated["title"] == "Updated"
    assert updated["description"] == "New detail"
    assert updated["priority"] == "medium"
    assert updated["status"] == "ready"


def test_move_card(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    first = repo.create_card({"title": "First"})
    second = repo.create_card({"title": "Second"})
    board = repo.get_default_board()
    ready_id = _column(board, "Ready")["id"]

    moved = repo.move_card(second["id"], ready_id, 0)
    board = repo.get_default_board()

    assert moved["column_id"] == ready_id
    assert moved["status"] == "ready"
    assert _column(board, "Ready")["cards"][0]["id"] == second["id"]
    assert _column(board, "Inbox")["cards"][0]["id"] == first["id"]


def test_archive_card(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    card = repo.create_card({"title": "Archive me"})

    archived = repo.archive_card(card["id"])
    board = repo.get_default_board()

    assert archived["archived_at"] is not None
    assert board["card_count"] == 0


def test_link_session_and_run(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    card = repo.create_card({"title": "Link me"})

    linked_session = repo.link_card_to_session(card["id"], "session-123")
    linked_run = repo.link_card_to_run(card["id"], "run-456")

    assert linked_session["session_id"] == "session-123"
    assert linked_run["session_id"] == "session-123"
    assert linked_run["run_id"] == "run-456"


def test_card_event_append(tmp_path: Path) -> None:
    storage = StudioStorage(data_dir=tmp_path / "studio-data")
    repo = KanbanRepository(storage)
    card = repo.create_card({"title": "Events"})

    event = repo.add_card_event(card["id"], "review.note", {"message": "Looks good", "count": 1})
    rows = _event_rows(storage, card["id"])

    assert event["type"] == "review.note"
    assert event["payload"] == {"message": "Looks good", "count": 1}
    assert [row[0] for row in rows] == ["card.created", "review.note"]


def test_persists_across_adapter_restart(tmp_path: Path) -> None:
    data_dir = tmp_path / "studio-data"
    first_repo = KanbanRepository(StudioStorage(data_dir=data_dir))
    card = first_repo.create_card({"title": "Persistent card"})

    second_repo = KanbanRepository(StudioStorage(data_dir=data_dir))
    board = second_repo.get_default_board()

    assert board["card_count"] == 1
    assert _column(board, "Inbox")["cards"][0]["id"] == card["id"]


def test_rejects_secret_like_values(tmp_path: Path) -> None:
    repo = _repo(tmp_path)

    with pytest.raises(RuntimeError, match="secret-like values"):
        repo.create_card({"title": "Bearer abc123"})

    card = repo.create_card({"title": "Safe"})
    with pytest.raises(RuntimeError, match="secret-like fields"):
        repo.add_card_event(card["id"], "unsafe", {"api_token": "value"})


def test_kanban_repository_does_not_write_to_hermes_state_db(tmp_path: Path) -> None:
    hermes_home = tmp_path / ".hermes"
    hermes_home.mkdir()
    hermes_db = hermes_home / "state.db"
    with sqlite3.connect(hermes_db) as conn:
        conn.execute("CREATE TABLE hermes_marker (id INTEGER PRIMARY KEY)")
        conn.execute("INSERT INTO hermes_marker (id) VALUES (1)")

    before = hermes_db.read_bytes()
    repo = KanbanRepository(StudioStorage(data_dir=tmp_path / "studio-data"))
    repo.create_card({"title": "Studio-only card"})
    after = hermes_db.read_bytes()

    assert before == after
    with sqlite3.connect(hermes_db) as conn:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
    assert tables == {"hermes_marker"}
