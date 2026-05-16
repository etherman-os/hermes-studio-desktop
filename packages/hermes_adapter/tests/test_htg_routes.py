"""Tests for /studio/htg/status route."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from hermes_adapter.security import set_auth_token
from hermes_adapter.server import create_app

HEADERS = {"Authorization": "Bearer htg-test-token"}


@pytest.fixture(autouse=True)
def _set_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set auth token once for all tests in this module."""
    set_auth_token("htg-test-token")


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


class TestHtgStatusRoute:
    """Tests for GET /studio/htg/status."""

    def test_returns_401_without_auth(self, client: TestClient) -> None:
        """Unauthenticated requests are rejected with 401."""
        resp = client.get("/studio/htg/status")
        assert resp.status_code == 401

    def test_returns_200_with_valid_auth_and_available_htg(self, client: TestClient) -> None:
        """Authenticated request returns 200 and correct shape when HTG is available."""
        mock_status = {
            "available": True,
            "cli_path": "/usr/bin/htg",
            "root": None,
            "doctor": {"project": "test-project"},
            "events": [],
            "checkpoints": [],
            "config_valid": True,
        }

        with patch(
            "hermes_adapter.htg_routes.probe_htg_status",
            new_callable=AsyncMock,
            return_value=mock_status,
        ):
            resp = client.get("/studio/htg/status", headers=HEADERS)

        assert resp.status_code == 200
        data = resp.json()
        assert "htg" in data
        assert "summary" in data
        assert data["summary"]["available"] is True
        assert data["htg"]["available"] is True
        assert data["htg"]["cli_path"] == "/usr/bin/htg"

    def test_returns_200_with_valid_auth_and_unavailable_htg(self, client: TestClient) -> None:
        """Authenticated request returns 200 when HTG is not installed."""
        mock_status = {
            "available": False,
            "reason": "HoldTheGoblin not found (no local checkout, no PATH binary)",
            "cli_path": None,
            "doctor": None,
            "events": None,
            "checkpoints": None,
            "config_valid": None,
        }

        with patch(
            "hermes_adapter.htg_routes.probe_htg_status",
            new_callable=AsyncMock,
            return_value=mock_status,
        ):
            resp = client.get("/studio/htg/status", headers=HEADERS)

        assert resp.status_code == 200
        data = resp.json()
        assert data["htg"]["available"] is False
        assert "not found" in data["htg"]["reason"].lower()
        assert data["summary"]["available"] is False

    def test_returns_401_with_wrong_token(self, client: TestClient) -> None:
        """Requests with a wrong token are rejected with 401."""
        resp = client.get("/studio/htg/status", headers={"Authorization": "Bearer wrong-token"})
        assert resp.status_code == 401
