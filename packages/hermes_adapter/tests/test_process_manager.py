"""Tests for process_manager module."""

from __future__ import annotations

from typing import Any

import pytest

import hermes_adapter.process_manager as process_manager_module
from hermes_adapter.process_manager import (
    ManagedProcess,
    ProcessManager,
    ProcessStatus,
    get_process_manager,
)


@pytest.fixture
def manager() -> ProcessManager:
    return ProcessManager()


def test_list_templates(manager: ProcessManager) -> None:
    templates = manager.list_templates()
    assert len(templates) >= 9
    ids = {t["id"] for t in templates}
    assert {"dev-server", "adapter", "test-runner", "build", "hermes-gateway", "hermes-doctor"} <= ids
    assert all("category" in t for t in templates)


def test_list_processes_empty(manager: ProcessManager) -> None:
    assert manager.list_processes() == []


def test_get_process_not_found(manager: ProcessManager) -> None:
    assert manager.get_process("nonexistent") is None


def test_get_process_dict_not_found(manager: ProcessManager) -> None:
    assert manager.get_process_dict("nonexistent") is None


def test_get_logs_not_found(manager: ProcessManager) -> None:
    with pytest.raises(ValueError, match="not found"):
        manager.get_logs("nonexistent")


def test_remove_process_not_found(manager: ProcessManager) -> None:
    assert manager.remove_process("nonexistent") is False


@pytest.mark.asyncio
async def test_start_process_invalid_template(manager: ProcessManager) -> None:
    with pytest.raises(ValueError, match="Unknown process template"):
        await manager.start_process("invalid-template")


@pytest.mark.asyncio
async def test_stop_process_not_found(manager: ProcessManager) -> None:
    with pytest.raises(ValueError, match="not found"):
        await manager.stop_process("nonexistent")


@pytest.mark.asyncio
async def test_stop_process_not_running(manager: ProcessManager) -> None:
    proc = ManagedProcess(
        id="test-1",
        template_id="dev-server",
        name="Test",
        command="echo hello",
        status=ProcessStatus.STOPPED,
        pid=None,
        started_at="2026-05-08T10:00:00Z",
        stopped_at=None,
        exit_code=None,
    )
    manager._processes["test-1"] = proc

    with pytest.raises(ValueError, match="not running"):
        await manager.stop_process("test-1")


def test_remove_process_running(manager: ProcessManager) -> None:
    proc = ManagedProcess(
        id="test-1",
        template_id="dev-server",
        name="Test",
        command="echo hello",
        status=ProcessStatus.RUNNING,
        pid=12345,
        started_at="2026-05-08T10:00:00Z",
        stopped_at=None,
        exit_code=None,
    )
    manager._processes["test-1"] = proc

    with pytest.raises(ValueError, match="Cannot remove a running process"):
        manager.remove_process("test-1")


def test_remove_process_stopped(manager: ProcessManager) -> None:
    proc = ManagedProcess(
        id="test-1",
        template_id="dev-server",
        name="Test",
        command="echo hello",
        status=ProcessStatus.STOPPED,
        pid=12345,
        started_at="2026-05-08T10:00:00Z",
        stopped_at="2026-05-08T10:30:00Z",
        exit_code=0,
    )
    manager._processes["test-1"] = proc

    assert manager.remove_process("test-1") is True
    assert manager.get_process("test-1") is None


def test_managed_process_to_dict() -> None:
    proc = ManagedProcess(
        id="test-1",
        template_id="dev-server",
        name="Test",
        command="echo hello",
        status=ProcessStatus.RUNNING,
        pid=12345,
        started_at="2026-05-08T10:00:00Z",
        stopped_at=None,
        exit_code=None,
    )
    d = proc.to_dict()
    assert d["id"] == "test-1"
    assert d["status"] == "running"
    assert d["pid"] == 12345


def test_get_process_manager_singleton() -> None:
    import hermes_adapter.process_manager as mod
    mod._manager = None
    m1 = get_process_manager()
    m2 = get_process_manager()
    assert m1 is m2
    mod._manager = None


class _EmptyStdout:
    def __aiter__(self) -> "_EmptyStdout":
        return self

    async def __anext__(self) -> bytes:
        raise StopAsyncIteration


class _FakeProcess:
    pid = 12345
    returncode = None
    stdout = _EmptyStdout()


@pytest.mark.asyncio
async def test_start_process_rejects_unallowed_env_override(
    manager: ProcessManager,
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    with pytest.raises(ValueError, match="not allowed"):
        await manager.start_process("hermes-doctor", env_overrides={"PATH": "/tmp/bin"})


@pytest.mark.asyncio
async def test_start_process_rejects_unsafe_allowed_env_value(
    manager: ProcessManager,
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    with pytest.raises(ValueError, match="unsafe characters"):
        await manager.start_process(
            "hermes-remote-ssh-check",
            env_overrides={"HERMES_STUDIO_REMOTE_SSH_TARGET": "devbox.example.com extra-arg"},
        )


@pytest.mark.asyncio
async def test_start_process_rejects_cwd_outside_workspace(
    manager: ProcessManager,
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.chdir(workspace)

    with pytest.raises(ValueError, match="outside the adapter workspace"):
        await manager.start_process("hermes-doctor", cwd=str(outside))


@pytest.mark.asyncio
async def test_start_process_allows_template_specific_env_override(
    manager: ProcessManager,
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    async def fake_create_subprocess_shell(*args: Any, **kwargs: Any) -> _FakeProcess:
        captured["args"] = args
        captured["kwargs"] = kwargs
        return _FakeProcess()

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(process_manager_module.asyncio, "create_subprocess_shell", fake_create_subprocess_shell)

    result = await manager.start_process(
        "hermes-remote-ssh-check",
        env_overrides={"HERMES_STUDIO_REMOTE_SSH_TARGET": "devbox.example.com"},
    )

    assert result["status"] == "running"
    assert captured["kwargs"]["cwd"] == str(tmp_path)
    assert captured["kwargs"]["env"]["HERMES_STUDIO_REMOTE_SSH_TARGET"] == "devbox.example.com"
