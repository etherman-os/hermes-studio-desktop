"""Tests for /studio/artifacts routes."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from hermes_adapter import studio_routes
from hermes_adapter.security import set_auth_token
from hermes_adapter.server import create_app

HEADERS = {"Authorization": "Bearer artifact-token"}


def _client() -> TestClient:
    set_auth_token("artifact-token")
    return TestClient(create_app())


def test_artifact_lifecycle_routes() -> None:
    client = _client()

    created = client.post(
        "/studio/artifacts",
        headers=HEADERS,
        json={
            "title": "Run report",
            "type": "markdown",
            "content_text": "# Run Summary\nDone",
            "run_id": "run-1",
            "source": "run",
        },
    )
    assert created.status_code == 200
    artifact = created.json()
    assert artifact["title"] == "Run report"
    assert artifact["run_id"] == "run-1"

    listed = client.get("/studio/artifacts", headers=HEADERS)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert "content_text" not in listed.json()["artifacts"][0]

    detail = client.get(f"/studio/artifacts/{artifact['id']}", headers=HEADERS)
    assert detail.status_code == 200
    assert detail.json()["content_text"] == "# Run Summary\nDone"

    patched = client.patch(
        f"/studio/artifacts/{artifact['id']}",
        headers=HEADERS,
        json={"title": "Updated report", "type": "report", "content_text": "Updated content"},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Updated report"
    assert patched.json()["type"] == "report"

    revisions = client.get(f"/studio/artifacts/{artifact['id']}/revisions", headers=HEADERS)
    assert revisions.status_code == 200
    assert revisions.json()["total"] == 2

    reverted = client.post(
        f"/studio/artifacts/{artifact['id']}/revert",
        headers=HEADERS,
        json={"version": 1},
    )
    assert reverted.status_code == 200
    assert reverted.json()["title"] == "Run report"
    assert reverted.json()["content_text"] == "# Run Summary\nDone"

    variant_group = client.post(
        f"/studio/artifacts/{artifact['id']}/variant-groups",
        headers=HEADERS,
        json={
            "title": "Report variants",
            "variants": [
                {
                    "label": "A",
                    "title": "Short report",
                    "content_text": "# Short\nDone",
                    "rationale": "More direct.",
                    "score": 88,
                }
            ],
        },
    )
    assert variant_group.status_code == 200
    assert variant_group.json()["variants"][0]["label"] == "Source"

    added_variant_group = client.post(
        f"/studio/artifact-variant-groups/{variant_group.json()['id']}/variants",
        headers=HEADERS,
        json={"label": "B", "title": "Detailed report", "content_text": "# Detailed\nDone"},
    )
    assert added_variant_group.status_code == 200
    assert len(added_variant_group.json()["variants"]) == 3

    variant_groups = client.get(f"/studio/artifacts/{artifact['id']}/variant-groups", headers=HEADERS)
    assert variant_groups.status_code == 200
    assert variant_groups.json()["total"] == 1

    applied = client.post(
        f"/studio/artifact-variant-groups/{variant_group.json()['id']}/apply",
        headers=HEADERS,
        json={"variant_id": variant_group.json()["variants"][1]["id"]},
    )
    assert applied.status_code == 200
    assert applied.json()["content_text"] == "# Short\nDone"
    assert applied.json()["variant_groups"][0]["status"] == "applied"

    linked_session = client.post(
        f"/studio/artifacts/{artifact['id']}/link-session",
        headers=HEADERS,
        json={"session_id": "session-1"},
    )
    assert linked_session.status_code == 200
    assert linked_session.json()["session_id"] == "session-1"

    linked_card = client.post(
        f"/studio/artifacts/{artifact['id']}/link-card",
        headers=HEADERS,
        json={"kanban_card_id": "card-1"},
    )
    assert linked_card.status_code == 200
    assert linked_card.json()["kanban_card_id"] == "card-1"

    archived = client.post(f"/studio/artifacts/{artifact['id']}/archive", headers=HEADERS)
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None


def test_artifact_routes_support_filters() -> None:
    client = _client()
    client.post(
        "/studio/artifacts",
        headers=HEADERS,
        json={"title": "Session note", "type": "text", "session_id": "session-1", "source": "session"},
    )

    resp = client.get("/studio/artifacts?type=text&session_id=session-1&search=Session", headers=HEADERS)

    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["artifacts"][0]["session_id"] == "session-1"


def test_artifact_browser_evidence_route_creates_report(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_browser_evidence(
        target_url: str,
        screenshot_path: Path,
        *,
        disable_javascript: bool,
    ) -> dict[str, object]:
        assert target_url.startswith("file://")
        assert disable_javascript is True
        screenshot_path.write_bytes(b"png")
        return {
            "final_url": target_url,
            "title": "Preview",
            "response_status": None,
            "console_messages": [],
            "page_errors": [],
            "checks": {
                "body_text_length": 12,
                "heading_count": 1,
                "unnamed_action_count": 0,
                "images_missing_alt_count": 0,
                "horizontal_overflow": False,
                "focusable_count": 1,
            },
        }

    monkeypatch.setattr(studio_routes, "_run_browser_evidence_script", fake_browser_evidence)
    client = _client()
    created = client.post(
        "/studio/artifacts",
        headers=HEADERS,
        json={
            "title": "Landing page",
            "type": "html",
            "content_text": "<html><body><h1>Hello</h1><button>Ship</button><script>throw new Error()</script></body></html>",
            "source": "design_canvas",
            "session_id": "session-1",
        },
    )
    assert created.status_code == 200

    evidence = client.post(f"/studio/artifacts/{created.json()['id']}/browser-evidence", headers=HEADERS)

    assert evidence.status_code == 200
    report = evidence.json()
    assert report["type"] == "report"
    assert report["source"] == "browser_evidence"
    assert report["session_id"] == "session-1"
    assert report["file_path"].endswith(".png")
    assert "# Browser Evidence" in report["content_text"]
    assert "JavaScript: disabled for sanitized artifact HTML" in report["content_text"]


def test_artifact_routes_require_auth() -> None:
    client = _client()

    resp = client.get("/studio/artifacts")

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "auth_missing"


def test_artifact_route_errors_use_standard_envelope() -> None:
    client = _client()

    resp = client.post("/studio/artifacts", headers=HEADERS, json={"title": "x" * 201})

    assert resp.status_code == 400
    error = resp.json()["error"]
    assert error["code"] == "artifact_error"
    assert error["source"] == "studio"
    assert "title" in error["message"]
