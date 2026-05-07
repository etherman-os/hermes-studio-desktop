"""Tests for tool pack repository — discovery, validation, enable/disable."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hermes_adapter.tool_pack_repository import ToolPackRepository, _validate_manifest


@pytest.fixture
def packs_dir(tmp_path: Path) -> Path:
    """Create a temporary packs directory."""
    d = tmp_path / "tool-packs"
    d.mkdir()
    return d


@pytest.fixture
def valid_manifest() -> dict:
    return {
        "id": "test-pack",
        "name": "Test Pack",
        "version": "1.0.0",
        "author": "tester",
        "description": "A test tool pack",
        "commands": [
            {
                "id": "hello",
                "name": "Hello",
                "description": "Say hello",
                "command": "echo hello",
            }
        ],
        "trusted": True,
        "permissions": ["filesystem:read"],
    }


@pytest.fixture
def untrusted_manifest() -> dict:
    return {
        "id": "untrusted-pack",
        "name": "Untrusted Pack",
        "version": "0.1.0",
        "author": "unknown",
        "commands": [
            {
                "id": "danger",
                "name": "Dangerous",
                "command": "rm -rf /",
            }
        ],
        "trusted": False,
    }


class TestValidateManifest:
    def test_valid_manifest(self, valid_manifest: dict) -> None:
        warnings = _validate_manifest(valid_manifest, Path("manifest.json"))
        assert len(warnings) == 0

    def test_missing_required_fields(self) -> None:
        data: dict = {"name": "Incomplete"}
        warnings = _validate_manifest(data, Path("manifest.json"))
        assert any("id" in w for w in warnings)
        assert any("version" in w for w in warnings)
        assert any("author" in w for w in warnings)
        assert any("commands" in w for w in warnings)

    def test_invalid_id_format(self) -> None:
        data = {
            "id": "Invalid ID!",
            "name": "Test",
            "version": "1.0.0",
            "author": "me",
            "commands": [{"id": "cmd", "name": "Cmd", "command": "echo hi"}],
        }
        warnings = _validate_manifest(data, Path("manifest.json"))
        assert any("invalid id format" in w for w in warnings)

    def test_invalid_version_format(self) -> None:
        data = {
            "id": "test",
            "name": "Test",
            "version": "not-semver",
            "author": "me",
            "commands": [{"id": "cmd", "name": "Cmd", "command": "echo hi"}],
        }
        warnings = _validate_manifest(data, Path("manifest.json"))
        assert any("invalid version" in w for w in warnings)

    def test_empty_commands(self) -> None:
        data = {
            "id": "test",
            "name": "Test",
            "version": "1.0.0",
            "author": "me",
            "commands": [],
        }
        warnings = _validate_manifest(data, Path("manifest.json"))
        assert any("non-empty array" in w for w in warnings)

    def test_duplicate_command_ids(self) -> None:
        data = {
            "id": "test",
            "name": "Test",
            "version": "1.0.0",
            "author": "me",
            "commands": [
                {"id": "dup", "name": "A", "command": "echo a"},
                {"id": "dup", "name": "B", "command": "echo b"},
            ],
        }
        warnings = _validate_manifest(data, Path("manifest.json"))
        assert any("duplicate command id" in w for w in warnings)

    def test_command_missing_name(self) -> None:
        data = {
            "id": "test",
            "name": "Test",
            "version": "1.0.0",
            "author": "me",
            "commands": [{"id": "cmd", "command": "echo hi"}],
        }
        warnings = _validate_manifest(data, Path("manifest.json"))
        assert any("missing 'name'" in w for w in warnings)

    def test_invalid_platform(self) -> None:
        data = {
            "id": "test",
            "name": "Test",
            "version": "1.0.0",
            "author": "me",
            "commands": [{"id": "cmd", "name": "Cmd", "command": "echo hi"}],
            "compat": {"platform": ["invalid-os"]},
        }
        warnings = _validate_manifest(data, Path("manifest.json"))
        assert any("invalid platform" in w for w in warnings)


class TestToolPackRepository:
    def test_empty_directory(self, packs_dir: Path, tmp_path: Path) -> None:
        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio"))
        try:
            repo = ToolPackRepository(packs_dir=packs_dir)
            packs = repo.list_packs()
            assert len(packs) == 0
        finally:
            monkeypatch.undo()

    def test_discovers_valid_pack(
        self, packs_dir: Path, valid_manifest: dict, tmp_path: Path
    ) -> None:
        pack_dir = packs_dir / "test-pack"
        pack_dir.mkdir()
        (pack_dir / "manifest.json").write_text(json.dumps(valid_manifest))

        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio"))
        try:
            repo = ToolPackRepository(packs_dir=packs_dir)
            packs = repo.list_packs()
            assert len(packs) == 1
            assert packs[0]["id"] == "test-pack"
            assert packs[0]["name"] == "Test Pack"
            assert packs[0]["valid"] is True
            assert packs[0]["trusted"] is True
            assert len(packs[0]["commands"]) == 1
        finally:
            monkeypatch.undo()

    def test_enable_disable_pack(
        self, packs_dir: Path, valid_manifest: dict, tmp_path: Path
    ) -> None:
        pack_dir = packs_dir / "test-pack"
        pack_dir.mkdir()
        (pack_dir / "manifest.json").write_text(json.dumps(valid_manifest))

        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio"))
        try:
            repo = ToolPackRepository(packs_dir=packs_dir)

            # Initially disabled
            packs = repo.list_packs()
            assert packs[0]["enabled"] is False

            # Enable
            enabled = repo.enable_pack("test-pack")
            assert enabled["enabled"] is True

            # Verify persistence
            packs = repo.list_packs()
            assert packs[0]["enabled"] is True

            # Disable
            disabled = repo.disable_pack("test-pack")
            assert disabled["enabled"] is False
        finally:
            monkeypatch.undo()

    def test_get_pack_not_found(
        self, packs_dir: Path, tmp_path: Path
    ) -> None:
        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio"))
        try:
            repo = ToolPackRepository(packs_dir=packs_dir)
            with pytest.raises(ValueError, match="not found"):
                repo.get_pack("nonexistent")
        finally:
            monkeypatch.undo()

    def test_enable_nonexistent_raises(
        self, packs_dir: Path, tmp_path: Path
    ) -> None:
        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio"))
        try:
            repo = ToolPackRepository(packs_dir=packs_dir)
            with pytest.raises(ValueError, match="not found"):
                repo.enable_pack("nonexistent")
        finally:
            monkeypatch.undo()

    def test_untrusted_pack_flag(
        self, packs_dir: Path, untrusted_manifest: dict, tmp_path: Path
    ) -> None:
        pack_dir = packs_dir / "untrusted-pack"
        pack_dir.mkdir()
        (pack_dir / "manifest.json").write_text(json.dumps(untrusted_manifest))

        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio"))
        try:
            repo = ToolPackRepository(packs_dir=packs_dir)
            packs = repo.list_packs()
            assert len(packs) == 1
            assert packs[0]["trusted"] is False
        finally:
            monkeypatch.undo()

    def test_invalid_manifest_skipped(
        self, packs_dir: Path, tmp_path: Path
    ) -> None:
        pack_dir = packs_dir / "bad-pack"
        pack_dir.mkdir()
        (pack_dir / "manifest.json").write_text('{"invalid": true}')

        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio"))
        try:
            repo = ToolPackRepository(packs_dir=packs_dir)
            packs = repo.list_packs()
            # Invalid pack still appears but with valid=False
            assert len(packs) == 1
            assert packs[0]["valid"] is False
        finally:
            monkeypatch.undo()

    def test_reload(self, packs_dir: Path, valid_manifest: dict, tmp_path: Path) -> None:
        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio"))
        try:
            repo = ToolPackRepository(packs_dir=packs_dir)
            assert len(repo.list_packs()) == 0

            # Add a pack
            pack_dir = packs_dir / "test-pack"
            pack_dir.mkdir()
            (pack_dir / "manifest.json").write_text(json.dumps(valid_manifest))

            repo.reload()
            assert len(repo.list_packs()) == 1
        finally:
            monkeypatch.undo()
