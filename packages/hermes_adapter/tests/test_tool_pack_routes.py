"""Tests for /studio/tool-packs/* adapter endpoints."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from hermes_adapter.security import set_auth_token
from hermes_adapter.server import create_app


@pytest.fixture(autouse=True)
def _set_token() -> None:
    """Set a test token so auth succeeds."""
    set_auth_token("test-token")


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


HEADERS = {"Authorization": "Bearer test-token"}


@pytest.fixture
def packs_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Create a temporary packs directory with a valid pack."""
    d = tmp_path / "tool-packs"
    d.mkdir()

    pack_dir = d / "example-tools"
    pack_dir.mkdir()
    manifest = {
        "id": "example-tools",
        "name": "Example Tools",
        "version": "1.0.0",
        "author": "Hermes Studio",
        "description": "Example pack",
        "commands": [
            {"id": "hello", "name": "Hello", "description": "Say hello", "command": "echo hello"},
            {"id": "status", "name": "Status", "description": "Show status", "command": "git status"},
        ],
        "trusted": True,
        "permissions": ["filesystem:read"],
        "compat": {"platform": ["linux", "macos"]},
    }
    (pack_dir / "manifest.json").write_text(json.dumps(manifest))

    monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio"))
    return d


class TestToolPackRoutes:
    def test_list_tool_packs(self, client: TestClient, packs_dir: Path) -> None:
        # Patch the default packs dir for the repository
        import hermes_adapter.tool_pack_repository as tpr

        original = tpr._DEFAULT_PACKS_DIR
        tpr._DEFAULT_PACKS_DIR = packs_dir
        try:
            resp = client.get("/studio/tool-packs", headers=HEADERS)
            assert resp.status_code == 200
            data = resp.json()
            assert "packs" in data
        finally:
            tpr._DEFAULT_PACKS_DIR = original

    def test_list_tool_packs_requires_auth(self, client: TestClient) -> None:
        resp = client.get("/studio/tool-packs")
        assert resp.status_code == 401

    def test_get_tool_pack_not_found(self, client: TestClient, packs_dir: Path) -> None:
        import hermes_adapter.tool_pack_repository as tpr

        original = tpr._DEFAULT_PACKS_DIR
        tpr._DEFAULT_PACKS_DIR = packs_dir
        try:
            resp = client.get("/studio/tool-packs/nonexistent", headers=HEADERS)
            assert resp.status_code == 404
        finally:
            tpr._DEFAULT_PACKS_DIR = original

    def test_enable_disable_tool_pack(self, client: TestClient, packs_dir: Path) -> None:
        import hermes_adapter.tool_pack_repository as tpr

        original = tpr._DEFAULT_PACKS_DIR
        tpr._DEFAULT_PACKS_DIR = packs_dir
        try:
            # Enable
            resp = client.post("/studio/tool-packs/example-tools/enable", headers=HEADERS)
            assert resp.status_code == 200
            data = resp.json()
            assert data["enabled"] is True

            # Disable
            resp = client.post("/studio/tool-packs/example-tools/disable", headers=HEADERS)
            assert resp.status_code == 200
            data = resp.json()
            assert data["enabled"] is False
        finally:
            tpr._DEFAULT_PACKS_DIR = original

    def test_enable_nonexistent_pack(self, client: TestClient, packs_dir: Path) -> None:
        import hermes_adapter.tool_pack_repository as tpr

        original = tpr._DEFAULT_PACKS_DIR
        tpr._DEFAULT_PACKS_DIR = packs_dir
        try:
            resp = client.post("/studio/tool-packs/nonexistent/enable", headers=HEADERS)
            assert resp.status_code == 404
        finally:
            tpr._DEFAULT_PACKS_DIR = original

    def test_install_missing_path(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/tool-packs/install",
            headers=HEADERS,
            json={},
        )
        assert resp.status_code == 400

    def test_install_invalid_path(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/tool-packs/install",
            headers=HEADERS,
            json={"path": "/nonexistent/path"},
        )
        assert resp.status_code in (400, 404)
