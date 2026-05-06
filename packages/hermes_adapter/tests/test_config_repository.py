"""Tests for config repository — read-only Hermes config access."""

from __future__ import annotations

from pathlib import Path

import pytest

from hermes_adapter.config_repository import ConfigRepository, _redact_value


class TestRedactValue:
    def test_redacts_api_key(self) -> None:
        assert _redact_value("api_key", "sk-abc123") == "[REDACTED]"

    def test_redacts_token(self) -> None:
        assert _redact_value("token", "secret-value") == "[REDACTED]"

    def test_preserves_non_sensitive(self) -> None:
        assert _redact_value("model", "claude-sonnet") == "claude-sonnet"

    def test_preserves_empty(self) -> None:
        assert _redact_value("api_key", "") == ""


class TestConfigRepository:
    @pytest.fixture()
    def hermes_home(self, tmp_path: Path) -> Path:
        home = tmp_path / ".hermes"
        home.mkdir()
        (home / "config.yaml").write_text(
            "provider: openrouter\n"
            "model: nous/hermes-3-llama-3.1-70b\n"
            "base_url: https://openrouter.ai/api/v1\n"
            "temperature: 0.7\n"
            "max_tokens: 4096\n"
        )
        (home / ".env").write_text(
            "OPENROUTER_API_KEY=sk-or-v1-very-secret-key-12345\n"
            "OTHER_VAR=not-secret\n"
        )
        return home

    def test_loads_config(self, hermes_home: Path) -> None:
        repo = ConfigRepository(hermes_home)
        assert repo.available is True

    def test_get_model_config(self, hermes_home: Path) -> None:
        repo = ConfigRepository(hermes_home)
        config = repo.get_model_config()
        assert config["provider"] == "openrouter"
        assert config["model"] == "nous/hermes-3-llama-3.1-70b"
        assert config["temperature"] == 0.7
        assert config["api_key_configured"] is True
        assert config["api_key_source"] == ".env"

    def test_redacts_base_url(self, hermes_home: Path) -> None:
        repo = ConfigRepository(hermes_home)
        config = repo.get_model_config()
        # base_url should be redacted if it contains sensitive patterns
        # In this case it's a normal URL, so it should be kept
        assert config["base_url"] is not None

    def test_detects_api_key(self, hermes_home: Path) -> None:
        repo = ConfigRepository(hermes_home)
        config = repo.get_model_config()
        assert config["api_key_configured"] is True

    def test_missing_config(self, tmp_path: Path) -> None:
        home = tmp_path / ".hermes"
        home.mkdir()
        repo = ConfigRepository(home)
        assert repo.available is False
        config = repo.get_model_config()
        assert config["provider"] == "unknown"

    def test_malformed_yaml(self, tmp_path: Path) -> None:
        home = tmp_path / ".hermes"
        home.mkdir()
        (home / "config.yaml").write_text("{{invalid yaml[[[")
        repo = ConfigRepository(home)
        assert repo.available is False
        config = repo.get_model_config()
        assert len(config["warnings"]) > 0

    def test_empty_config(self, tmp_path: Path) -> None:
        home = tmp_path / ".hermes"
        home.mkdir()
        (home / "config.yaml").write_text("")
        repo = ConfigRepository(home)
        config = repo.get_model_config()
        assert config["provider"] == "unknown"

    def test_get_provider_status(self, hermes_home: Path) -> None:
        repo = ConfigRepository(hermes_home)
        status = repo.get_provider_status()
        assert status["provider"] == "openrouter"
        assert status["api_key_configured"] is True

    def test_get_status(self, hermes_home: Path) -> None:
        repo = ConfigRepository(hermes_home)
        status = repo.get_status()
        assert status["available"] is True
        assert status["config_source"] == "config.yaml"

    def test_no_env_file(self, tmp_path: Path) -> None:
        home = tmp_path / ".hermes"
        home.mkdir()
        (home / "config.yaml").write_text("provider: test\nmodel: test-model\n")
        repo = ConfigRepository(home)
        config = repo.get_model_config()
        assert config["api_key_configured"] is False

    def test_real_nested_model_config_shape(self, tmp_path: Path) -> None:
        home = tmp_path / ".hermes"
        home.mkdir()
        (home / "config.yaml").write_text(
            "model:\n"
            "  provider: glm\n"
            "  default: glm-4.5\n"
            "  base_url: https://api.example.test/v1\n"
            "providers:\n"
            "  glm:\n"
            "    base_url: https://provider.example.test/v1\n"
        )

        repo = ConfigRepository(home)
        config = repo.get_model_config()

        assert config["provider"] == "glm"
        assert config["model"] == "glm-4.5"
        assert config["base_url"] == "https://api.example.test/v1"
