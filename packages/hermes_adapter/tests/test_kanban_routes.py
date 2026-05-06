"""Tests for /studio/kanban/* routes."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from hermes_adapter.security import set_auth_token
from hermes_adapter.server import create_app

HEADERS = {"Authorization": "Bearer kanban-token"}


@pytest.fixture(autouse=True)
def _set_token() -> None:
    set_auth_token("kanban-token")


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def _column(board: dict[str, Any], name: str) -> dict[str, Any]:
    for column in board["columns"]:
        if column["name"] == name:
            return column
    raise AssertionError(f"Column {name!r} not found")


def test_kanban_routes_create_default_board(client: TestClient) -> None:
    resp = client.get("/studio/kanban/boards/default", headers=HEADERS)

    assert resp.status_code == 200
    board = resp.json()
    assert board["id"] == "board_default"
    assert [column["name"] for column in board["columns"]] == [
        "Inbox",
        "Ready",
        "Doing",
        "Blocked",
        "Done",
    ]


def test_kanban_boards_list(client: TestClient) -> None:
    resp = client.get("/studio/kanban/boards", headers=HEADERS)

    assert resp.status_code == 200
    assert resp.json()["boards"][0]["id"] == "board_default"


def test_kanban_card_lifecycle(client: TestClient) -> None:
    created = client.post(
        "/studio/kanban/cards",
        headers=HEADERS,
        json={"title": "Route card", "description": "Created through API", "priority": "high"},
    )
    assert created.status_code == 200
    card = created.json()
    assert card["title"] == "Route card"

    patched = client.patch(
        f"/studio/kanban/cards/{card['id']}",
        headers=HEADERS,
        json={"title": "Updated route card", "status": "ready"},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Updated route card"

    board = client.get("/studio/kanban/boards/default", headers=HEADERS).json()
    doing_id = _column(board, "Doing")["id"]
    moved = client.post(
        f"/studio/kanban/cards/{card['id']}/move",
        headers=HEADERS,
        json={"column_id": doing_id, "position": 0},
    )
    assert moved.status_code == 200
    assert moved.json()["column_id"] == doing_id
    assert moved.json()["status"] == "doing"

    linked_session = client.post(
        f"/studio/kanban/cards/{card['id']}/link-session",
        headers=HEADERS,
        json={"session_id": "session-1"},
    )
    assert linked_session.status_code == 200
    assert linked_session.json()["session_id"] == "session-1"

    linked_run = client.post(
        f"/studio/kanban/cards/{card['id']}/link-run",
        headers=HEADERS,
        json={"run_id": "run-1"},
    )
    assert linked_run.status_code == 200
    assert linked_run.json()["run_id"] == "run-1"

    archived = client.post(f"/studio/kanban/cards/{card['id']}/archive", headers=HEADERS)
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None


def test_get_kanban_board_by_id(client: TestClient) -> None:
    board = client.get("/studio/kanban/boards/default", headers=HEADERS).json()
    resp = client.get(f"/studio/kanban/boards/{board['id']}", headers=HEADERS)

    assert resp.status_code == 200
    assert resp.json()["id"] == board["id"]


def test_kanban_routes_require_auth(client: TestClient) -> None:
    resp = client.get("/studio/kanban/boards")

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "auth_missing"


def test_kanban_route_errors_use_standard_envelope(client: TestClient) -> None:
    resp = client.post("/studio/kanban/cards", headers=HEADERS, json={"title": "Bearer abc123"})

    assert resp.status_code == 400
    error = resp.json()["error"]
    assert error["code"] == "kanban_error"
    assert error["source"] == "studio"
    assert "secret-like values" in error["message"]
