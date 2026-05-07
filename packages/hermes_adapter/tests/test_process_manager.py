"""Tests for process_manager module."""

from __future__ import annotations

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from hermes_adapter.process_manager import (
    ManagedProcess,
    ProcessManager,
    ProcessStatus,
    TEMPLATES,
    get_process_manager,
)


@pytest.fixture
def manager() -> ProcessManager:
    return ProcessManager()


def test_list_templates(manager: ProcessManager) -> None:
    templates = manager.list_templates()
    assert len(templates) == 4
    ids = {t["id"] for t in templates}
    assert ids == {"dev-server", "adapter", "test-runner", "build"}


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
