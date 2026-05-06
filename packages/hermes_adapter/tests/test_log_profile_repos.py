"""Tests for log repository and profile repository."""

from __future__ import annotations

from pathlib import Path

import pytest

from hermes_adapter.log_repository import LogRepository, _redact_line, get_hermes_logs_dir
from hermes_adapter.profile_repository import ProfileRepository


class TestRedactLine:
    def test_redacts_bearer_token(self) -> None:
        line = "Authorization: Bearer sk-abc123def456"
        result = _redact_line(line)
        assert "Bearer [REDACTED]" in result
        assert "sk-abc123def456" not in result

    def test_redacts_api_key(self) -> None:
        line = "api_key=sk-very-secret-key-12345"
        result = _redact_line(line)
        assert "REDACTED" in result
        assert "sk-very-secret-key-12345" not in result

    def test_redacts_long_hex(self) -> None:
        line = "hash: abcdef0123456789abcdef0123456789abcdef01"
        result = _redact_line(line)
        assert "REDACTED" in result
        assert "abcdef0123456789abcdef0123456789abcdef01" not in result

    def test_preserves_normal_text(self) -> None:
        line = "[INFO] Application started successfully"
        result = _redact_line(line)
        assert result == line


class TestLogRepository:
    @pytest.fixture()
    def logs_dir(self, tmp_path: Path) -> Path:
        """Create a fixture logs directory with sample log files."""
        logs = tmp_path / "logs"
        logs.mkdir()

        (logs / "agent.log").write_text(
            "[10:00:00] [INFO] Adapter started\n"
            "[10:00:01] [INFO] Health check OK\n"
            "[10:00:02] [WARN] Theme cache expired\n"
            "[10:00:03] [INFO] Run started: run_abc\n"
            "[10:00:04] [ERROR] Connection timeout\n"
        )
        (logs / "errors.log").write_text(
            "[10:00:04] [ERROR] Connection timeout\n"
        )
        return logs

    def test_discovers_log_files(self, logs_dir: Path) -> None:
        repo = LogRepository(logs_dir)
        assert repo.available is True
        assert "agent.log" in repo.log_files
        assert "errors.log" in repo.log_files

    def test_empty_dir(self, tmp_path: Path) -> None:
        empty = tmp_path / "empty"
        empty.mkdir()
        repo = LogRepository(empty)
        assert repo.available is False

    def test_missing_dir(self, tmp_path: Path) -> None:
        repo = LogRepository(tmp_path / "nonexistent")
        assert repo.available is False

    def test_get_recent_logs(self, logs_dir: Path) -> None:
        repo = LogRepository(logs_dir)
        result = repo.get_recent_logs(source="agent.log", tail=3)
        assert result["source"] == "agent.log"
        assert len(result["lines"]) == 3
        assert "Connection timeout" in result["lines"][-1]

    def test_get_recent_logs_default_source(self, logs_dir: Path) -> None:
        repo = LogRepository(logs_dir)
        result = repo.get_recent_logs()
        assert result["source"] == "agent.log"  # first alphabetical

    def test_get_status(self, logs_dir: Path) -> None:
        repo = LogRepository(logs_dir)
        status = repo.get_status()
        assert status["available"] is True
        assert "agent.log" in status["log_files"]

    def test_redacts_secrets(self, tmp_path: Path) -> None:
        logs = tmp_path / "logs"
        logs.mkdir()
        (logs / "agent.log").write_text(
            "[INFO] Using API key: sk-very-secret-12345\n"
            "[INFO] Normal log line\n"
        )
        repo = LogRepository(logs)
        result = repo.get_recent_logs()
        assert "sk-very-secret-12345" not in result["lines"][0]
        assert "Normal log line" in result["lines"][1]


class TestProfileRepository:
    @pytest.fixture()
    def hermes_home(self, tmp_path: Path) -> Path:
        """Create a fixture Hermes home with profiles."""
        home = tmp_path / ".hermes"
        home.mkdir()

        # Create config with active profile
        (home / "config.yaml").write_text("profile: coder\n")

        # Create profiles directory
        profiles = home / "profiles"
        profiles.mkdir()

        # Create coder profile
        coder = profiles / "coder"
        coder.mkdir()
        (coder / "config.yaml").write_text("model: claude-sonnet\n")

        # Create research profile
        research = profiles / "research"
        research.mkdir()
        (research / "state.db").touch()

        return home

    def test_discovers_profiles(self, hermes_home: Path) -> None:
        repo = ProfileRepository(hermes_home)
        assert repo.available is True
        assert repo.profile_count == 2

    def test_detects_active_profile(self, hermes_home: Path) -> None:
        repo = ProfileRepository(hermes_home)
        assert repo.active_profile == "coder"

    def test_list_profiles(self, hermes_home: Path) -> None:
        repo = ProfileRepository(hermes_home)
        profiles = repo.list_profiles()
        names = [p["name"] for p in profiles]
        assert "coder" in names
        assert "research" in names

    def test_get_active_profile(self, hermes_home: Path) -> None:
        repo = ProfileRepository(hermes_home)
        active = repo.get_active_profile()
        assert active is not None
        assert active["name"] == "coder"
        assert active["active"] is True

    def test_profile_metadata(self, hermes_home: Path) -> None:
        repo = ProfileRepository(hermes_home)
        profiles = repo.list_profiles()
        coder = next(p for p in profiles if p["name"] == "coder")
        assert coder["has_config"] is True

        research = next(p for p in profiles if p["name"] == "research")
        assert research["has_state_db"] is True

    def test_empty_hermes_home(self, tmp_path: Path) -> None:
        home = tmp_path / ".hermes"
        home.mkdir()
        repo = ProfileRepository(home)
        # Should still return a default profile
        assert repo.available is True
        assert repo.profile_count >= 1

    def test_missing_hermes_home(self, tmp_path: Path) -> None:
        repo = ProfileRepository(tmp_path / "nonexistent")
        # Should return default profile
        assert repo.available is True

    def test_get_status(self, hermes_home: Path) -> None:
        repo = ProfileRepository(hermes_home)
        status = repo.get_status()
        assert status["available"] is True
        assert status["active_profile"] == "coder"
        assert status["profile_count"] == 2
