"""Tests for config_repository hardening features."""

from __future__ import annotations

from pathlib import Path

import yaml

from hermes_adapter.config_repository import (
    ConfigRepository,
    _create_config_backup,
    check_file_permissions,
    rollback_config,
    validate_config,
)


class TestFilePermissionChecks:
    def test_warns_world_readable(self, tmp_path: Path) -> None:
        config_path = tmp_path / "config.yaml"
        config_path.write_text("provider: openai", encoding="utf-8")
        config_path.chmod(0o644)

        warnings = check_file_permissions(config_path)
        assert any("world-readable" in w for w in warnings)

    def test_no_warning_for_restrictive(self, tmp_path: Path) -> None:
        config_path = tmp_path / "config.yaml"
        config_path.write_text("provider: openai", encoding="utf-8")
        config_path.chmod(0o600)

        warnings = check_file_permissions(config_path)
        assert len(warnings) == 0

    def test_warns_world_writable(self, tmp_path: Path) -> None:
        config_path = tmp_path / "config.yaml"
        config_path.write_text("provider: openai", encoding="utf-8")
        config_path.chmod(0o666)

        warnings = check_file_permissions(config_path)
        assert any("world-writable" in w for w in warnings)

    def test_no_warning_for_missing_file(self, tmp_path: Path) -> None:
        warnings = check_file_permissions(tmp_path / "nonexistent.yaml")
        assert len(warnings) == 0


class TestConfigValidation:
    def test_accepts_valid_config(self) -> None:
        errors = validate_config({"provider": "openai", "model": "gpt-4", "temperature": 0.7})
        assert errors == []

    def test_rejects_non_dict(self) -> None:
        errors = validate_config("not a dict")  # type: ignore[arg-type]
        assert len(errors) == 1
        assert "mapping" in errors[0]

    def test_rejects_invalid_type_for_provider(self) -> None:
        errors = validate_config({"provider": 123})
        assert any("provider" in e for e in errors)

    def test_rejects_non_numeric_temperature(self) -> None:
        errors = validate_config({"temperature": "warm"})
        assert any("temperature" in e for e in errors)


class TestConfigBackup:
    def test_creates_backup(self, tmp_path: Path) -> None:
        config = tmp_path / "config.yaml"
        config.write_text("provider: openai", encoding="utf-8")

        backup = _create_config_backup(config)
        assert backup is not None
        assert backup.exists()
        assert backup.read_text(encoding="utf-8") == "provider: openai"

    def test_rotation_limits_backups(self, tmp_path: Path) -> None:
        config = tmp_path / "config.yaml"
        config.write_text("provider: openai", encoding="utf-8")

        for _ in range(5):
            _create_config_backup(config)

        backups = list(tmp_path.glob("config.yaml.bak.*"))
        assert len(backups) <= 3


class TestConfigRollback:
    def test_rollback_from_backup(self, tmp_path: Path) -> None:
        config = tmp_path / "config.yaml"
        config.write_text("provider: openai", encoding="utf-8")
        _create_config_backup(config)

        # Overwrite config
        config.write_text("provider: anthropic", encoding="utf-8")

        result = rollback_config(config)
        assert result is True
        assert config.read_text(encoding="utf-8") == "provider: openai"

    def test_rollback_fails_without_backups(self, tmp_path: Path) -> None:
        config = tmp_path / "config.yaml"
        config.write_text("provider: openai", encoding="utf-8")

        result = rollback_config(config)
        assert result is False


class TestConfigRepositoryPermissionWarnings:
    def test_warns_on_world_readable_config(self, tmp_path: Path) -> None:
        config_dir = tmp_path / ".hermes"
        config_dir.mkdir()
        config_path = config_dir / "config.yaml"
        config_path.write_text(yaml.dump({"provider": "openai", "model": "gpt-4"}), encoding="utf-8")
        config_path.chmod(0o644)

        repo = ConfigRepository(config_dir)
        assert repo.available is True
        assert any("world-readable" in w for w in repo.get_status()["warnings"])
