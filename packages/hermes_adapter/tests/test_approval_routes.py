"""Tests for /studio/approvals routes."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from hermes_adapter import studio_routes
from hermes_adapter.approval_repository import ApprovalRepository
from hermes_adapter.mock_backend import MockBackend
from hermes_adapter.security import set_auth_token
from hermes_adapter.server import create_app
from hermes_adapter.studio_events import make_studio_event

HEADERS = {"Authorization": "Bearer approval-token"}


def _client() -> TestClient:
    set_auth_token("approval-token")
    return TestClient(create_app())


def _seed() -> None:
    repo = ApprovalRepository()
    repo.record_approval_requested(
        make_studio_event(
            "approval.requested",
            {"approval_id": "approval-route", "tool": "shell", "action": "pytest", "risk_level": "medium"},
            run_id="run-route",
            session_id="s-route",
        )
    )


def test_approval_routes_list_pending_and_detail() -> None:
    client = _client()
    _seed()

    listed = client.get("/studio/approvals", headers=HEADERS)
    pending = client.get("/studio/approvals/pending", headers=HEADERS)
    detail = client.get("/studio/approvals/approval-route", headers=HEADERS)

    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert pending.status_code == 200
    assert pending.json()["approvals"][0]["id"] == "approval-route"
    assert detail.status_code == 200
    assert detail.json()["request_payload"]["action"] == "pytest"
    assert detail.json()["events"][0]["type"] == "approval.requested"


def test_approval_routes_support_run_and_session_scopes() -> None:
    client = _client()
    _seed()

    run_items = client.get("/studio/runs/run-route/approvals", headers=HEADERS)
    session_items = client.get("/studio/sessions/s-route/approvals", headers=HEADERS)

    assert run_items.status_code == 200
    assert run_items.json()["approvals"][0]["id"] == "approval-route"
    assert session_items.status_code == 200
    assert session_items.json()["approvals"][0]["id"] == "approval-route"


def test_approval_routes_require_auth() -> None:
    client = _client()

    resp = client.get("/studio/approvals")

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "auth_missing"


def test_approval_response_routes_are_read_only_until_wired() -> None:
    client = _client()
    _seed()

    resp = client.post("/studio/approvals/approval-route/approve", headers=HEADERS)

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "responded"
    assert data["approval_id"] == "approval-route"
    assert data["decision"] == "approved"


def test_streamed_approval_events_are_persisted(monkeypatch: pytest.MonkeyPatch) -> None:
    class ApprovalStreamBackend(MockBackend):
        async def stream_run_events(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
            yield make_studio_event(
                "run.started",
                {"run_id": run_id, "session_id": "s-stream"},
                source="adapter",
                run_id=run_id,
                session_id="s-stream",
            )
            yield make_studio_event(
                "approval.requested",
                {"approval_id": "approval-stream", "tool": "shell", "action": "pytest", "risk_level": "high"},
                source="adapter",
                run_id=run_id,
                session_id="s-stream",
            )
            yield make_studio_event(
                "approval.resolved",
                {"approval_id": "approval-stream", "decision": "denied"},
                source="adapter",
                run_id=run_id,
                session_id="s-stream",
            )
            yield make_studio_event(
                "run.completed",
                {"run_id": run_id, "duration_ms": 1},
                source="adapter",
                run_id=run_id,
                session_id="s-stream",
            )

    monkeypatch.setattr(studio_routes, "_backend", ApprovalStreamBackend())
    monkeypatch.setattr(studio_routes, "_backend_status", {"backend_mode": "mock", "active_backend": "mock"})
    client = _client()

    started = client.post("/studio/runs", headers=HEADERS, json={"session_id": "s-stream", "prompt": "needs approval"})
    run_id = started.json()["run_id"]

    with client.stream("GET", f"/studio/runs/{run_id}/events", headers=HEADERS) as stream:
        for _line in stream.iter_lines():
            pass

    resp = client.get(f"/studio/runs/{run_id}/approvals", headers=HEADERS)

    assert resp.status_code == 200
    approval = resp.json()["approvals"][0]
    assert approval["id"] == "approval-stream"
    assert approval["status"] == "denied"
    assert approval["risk_level"] == "high"
