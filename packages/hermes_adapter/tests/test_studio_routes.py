"""Tests for /studio/* adapter endpoints."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from hermes_adapter.security import set_auth_token
from hermes_adapter.server import app


@pytest.fixture(autouse=True)
def _set_token() -> None:
    """Set a test token so auth succeeds."""
    set_auth_token("test-token")


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


HEADERS = {"Authorization": "Bearer test-token"}


class TestHealthEndpoints:
    def test_root_health(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "adapter_version" in data
        assert "hermes_connected" in data

    def test_studio_health(self, client: TestClient) -> None:
        resp = client.get("/studio/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"

    def test_health_no_auth_required(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200


class TestBootstrap:
    def test_bootstrap_shape(self, client: TestClient) -> None:
        resp = client.get("/studio/bootstrap", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "adapter_version" in data
        assert "hermes_version" in data
        assert "active_profile" in data
        assert "capabilities" in data
        assert isinstance(data["capabilities"], list)
        assert "recent_sessions" in data
        assert isinstance(data["recent_sessions"], list)
        assert "active_theme" in data
        assert "available_models" in data


class TestProfiles:
    def test_list_profiles(self, client: TestClient) -> None:
        resp = client.get("/studio/profiles", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert "name" in data[0]
        assert "path" in data[0]


class TestSessions:
    def test_list_sessions(self, client: TestClient) -> None:
        resp = client.get("/studio/sessions", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "sessions" in data
        assert "total" in data
        assert isinstance(data["sessions"], list)
        assert data["total"] >= 1

    def test_get_session(self, client: TestClient) -> None:
        resp = client.get("/studio/sessions/s-1", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "s-1"
        assert "transcript_preview" in data

    def test_get_session_not_found(self, client: TestClient) -> None:
        resp = client.get("/studio/sessions/nonexistent", headers=HEADERS)
        assert resp.status_code == 404


class TestRuns:
    def test_start_run(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/runs",
            headers=HEADERS,
            json={"session_id": "s-1", "prompt": "hello"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "run_id" in data
        assert data["status"] == "started"

    def test_stop_run(self, client: TestClient) -> None:
        # Start a run first
        resp = client.post(
            "/studio/runs",
            headers=HEADERS,
            json={"session_id": "s-1", "prompt": "test"},
        )
        run_id = resp.json()["run_id"]

        # Stop it
        resp = client.post(f"/studio/runs/{run_id}/stop", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["run_id"] == run_id
        assert data["status"] == "cancelled"

    def test_sse_stream_emits_events(self, client: TestClient) -> None:
        # Start a run
        resp = client.post(
            "/studio/runs",
            headers=HEADERS,
            json={"session_id": "s-1", "prompt": "hello"},
        )
        run_id = resp.json()["run_id"]

        # Stream events — collect all lines until stream closes
        with client.stream("GET", f"/studio/runs/{run_id}/events", headers=HEADERS) as stream:
            events = []
            for line in stream.iter_lines():
                if line.startswith("event: "):
                    events.append(line.split("event: ", 1)[1])

        # Should have received all events in sequence
        assert "run.started" in events
        assert "assistant.delta" in events
        assert "tool.started" in events
        assert "tool.completed" in events
        assert "run.completed" in events


class TestThemes:
    def test_list_themes(self, client: TestClient) -> None:
        resp = client.get("/studio/themes", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "themes" in data
        assert "active" in data
        assert len(data["themes"]) >= 1

    def test_activate_theme(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/themes/activate",
            headers=HEADERS,
            json={"theme_id": "minecraft-overworld"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "minecraft-overworld"

    def test_activate_theme_not_found(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/themes/activate",
            headers=HEADERS,
            json={"theme_id": "nonexistent"},
        )
        assert resp.status_code == 404


class TestConfig:
    def test_get_config(self, client: TestClient) -> None:
        resp = client.get("/studio/config", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "config" in data

    def test_patch_config(self, client: TestClient) -> None:
        resp = client.patch(
            "/studio/config",
            headers=HEADERS,
            json={"key": "test_key", "value": "test_value"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["config"]["test_key"] == "test_value"


class TestLogs:
    def test_get_logs(self, client: TestClient) -> None:
        resp = client.get("/studio/logs", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "source" in data
        assert "lines" in data
        assert "total" in data
