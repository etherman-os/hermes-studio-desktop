"""Shared fixtures for Hermes Adapter tests."""

from pathlib import Path

import pytest

from hermes_adapter import theme_repository
from hermes_adapter.security import set_auth_token


@pytest.fixture
def project_themes_dir() -> Path:
    """Return the path to the project's *themes/* directory."""
    return Path(__file__).resolve().parents[3] / "themes"


@pytest.fixture
def sample_run_started_event() -> dict:
    return {"type": "run.started", "payload": {"run_id": "r1"}, "source": "hermes"}


@pytest.fixture
def sample_assistant_delta_event() -> dict:
    return {"type": "assistant.delta", "payload": {"content": "hi"}, "source": "hermes"}


@pytest.fixture
def sample_tool_started_event() -> dict:
    return {"type": "tool.started", "payload": {"tool": "ls"}, "source": "hermes"}


@pytest.fixture
def sample_run_completed_ok_event() -> dict:
    return {"type": "run.completed", "payload": {"status": "ok"}, "source": "hermes"}


@pytest.fixture
def sample_run_completed_failure_event() -> dict:
    return {
        "type": "run.completed",
        "payload": {"status": "failed", "error": "Oops"},
        "source": "hermes",
    }


@pytest.fixture
def sample_unknown_event() -> dict:
    return {"type": "hermes.custom", "payload": {}, "source": "hermes"}


@pytest.fixture(autouse=True)
def _reset_auth_token():
    """Ensure the auth token is clean between bootstrap tests."""
    set_auth_token("test-secret-token")
    yield
    set_auth_token(None)


@pytest.fixture(autouse=True)
def _isolate_studio_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep tests from reading or writing the user's Studio config."""
    config_dir = tmp_path / "studio-config"
    monkeypatch.setattr(theme_repository, "_STUDIO_CONFIG_DIR", config_dir)
    monkeypatch.setattr(theme_repository, "_STUDIO_CONFIG_FILE", config_dir / "config.json")


@pytest.fixture(autouse=True)
def _isolate_studio_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep tests from reading or writing the user's Studio storage."""
    monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio-home"))
    monkeypatch.setenv("HERMES_STUDIO_HERMES_HOME", str(tmp_path / ".hermes"))
    monkeypatch.delenv("HERMES_STUDIO_DB_PATH", raising=False)
