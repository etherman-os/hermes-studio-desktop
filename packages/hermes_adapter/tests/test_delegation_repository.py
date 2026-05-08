"""Tests for Studio-owned delegation repository."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from hermes_adapter.delegation_repository import DelegationRepository
from hermes_adapter.run_ledger_repository import RunLedgerRepository
from hermes_adapter.studio_events import make_studio_event
from hermes_adapter.studio_storage import StudioStorage


def _storage(tmp_path: Path) -> StudioStorage:
    return StudioStorage(data_dir=tmp_path / "studio-data")


def _repo(tmp_path: Path) -> DelegationRepository:
    return DelegationRepository(_storage(tmp_path))


def _run_repo(tmp_path: Path) -> RunLedgerRepository:
    return RunLedgerRepository(_storage(tmp_path))


def _event(
    event_type: str,
    payload: dict[str, Any] | None = None,
    run_id: str = "run-parent",
) -> dict[str, Any]:
    return make_studio_event(
        event_type,
        payload or {},
        source="hermes",
        run_id=run_id,
        session_id="session-1",
    )


def test_empty_delegations(tmp_path: Path) -> None:
    result = _repo(tmp_path).list_delegations()
    assert result["delegations"] == []
    assert result["total"] == 0
    assert result["source"] == "run_events"


def test_delegation_from_delegate_tool_event(tmp_path: Path) -> None:
    run_repo = _run_repo(tmp_path)
    repo = _repo(tmp_path)

    run_repo.create_run(
        run_id="run-parent",
        session_id="session-1",
        status="started",
        prompt="Parent task",
        backend="mock",
    )
    run_repo.create_run(
        run_id="run-child",
        session_id="session-1",
        status="started",
        prompt="Child task",
        backend="mock",
    )

    run_repo.append_event(
        "run-parent",
        _event(
            "tool.started",
            {"tool": "delegate", "child_run_id": "run-child"},
            "run-parent",
        ),
    )

    result = repo.list_delegations()
    assert result["total"] >= 1
    delegation = result["delegations"][0]
    assert delegation["parent_run_id"] == "run-parent"
    assert delegation["child_run_id"] == "run-child"
    assert delegation["tool_name"] == "delegate"


def test_delegation_from_sub_agent_tool_event(tmp_path: Path) -> None:
    run_repo = _run_repo(tmp_path)
    repo = _repo(tmp_path)

    run_repo.create_run(
        run_id="run-main",
        session_id="session-1",
        status="started",
        prompt="Main task",
        backend="mock",
    )
    run_repo.create_run(
        run_id="run-sub",
        session_id="session-1",
        status="completed",
        prompt="Sub task",
        backend="mock",
    )

    run_repo.append_event(
        "run-main",
        _event(
            "tool.started",
            {"tool": "sub_agent", "delegated_run_id": "run-sub"},
            "run-main",
        ),
    )

    result = repo.list_delegations()
    assert result["total"] >= 1
    delegation = result["delegations"][0]
    assert delegation["parent_run_id"] == "run-main"
    assert delegation["child_run_id"] == "run-sub"


def test_delegation_filter_by_parent_run_id(tmp_path: Path) -> None:
    run_repo = _run_repo(tmp_path)
    repo = _repo(tmp_path)

    run_repo.create_run(run_id="run-a", session_id="s1", status="started", prompt="A", backend="mock")
    run_repo.create_run(run_id="run-b", session_id="s1", status="started", prompt="B", backend="mock")
    run_repo.create_run(run_id="run-child-a", session_id="s1", status="completed", prompt="CA", backend="mock")
    run_repo.create_run(run_id="run-child-b", session_id="s1", status="completed", prompt="CB", backend="mock")

    run_repo.append_event("run-a", _event("tool.started", {"tool": "delegate", "child_run_id": "run-child-a"}, "run-a"))
    run_repo.append_event("run-b", _event("tool.started", {"tool": "delegate", "child_run_id": "run-child-b"}, "run-b"))

    result = repo.list_delegations(parent_run_id="run-a")
    assert all(d["parent_run_id"] == "run-a" for d in result["delegations"])


def test_get_delegation_detail(tmp_path: Path) -> None:
    run_repo = _run_repo(tmp_path)
    repo = _repo(tmp_path)

    run_repo.create_run(run_id="run-p", session_id="s1", status="started", prompt="Parent", backend="mock")
    run_repo.create_run(run_id="run-c", session_id="s1", status="completed", prompt="Child", backend="mock")
    run_repo.append_event("run-p", _event("tool.started", {"tool": "delegate", "child_run_id": "run-c"}, "run-p"))

    detail = repo.get_delegation("run-p:run-c")
    assert detail["id"] == "run-p:run-c"
    assert detail["parent_run"]["id"] == "run-p"
    assert detail["child_run"]["id"] == "run-c"
    assert detail["tool_name"] == "delegate"


def test_get_delegation_not_found(tmp_path: Path) -> None:
    import pytest

    with pytest.raises(ValueError, match="not found"):
        _repo(tmp_path).get_delegation("nonexistent:delegation")


def test_non_delegation_tool_events_ignored(tmp_path: Path) -> None:
    run_repo = _run_repo(tmp_path)
    repo = _repo(tmp_path)

    run_repo.create_run(run_id="run-1", session_id="s1", status="started", prompt="Test", backend="mock")
    run_repo.append_event("run-1", _event("tool.started", {"tool": "bash", "command": "ls"}, "run-1"))
    run_repo.append_event("run-1", _event("tool.completed", {"tool": "bash", "success": True}, "run-1"))

    result = repo.list_delegations()
    assert result["total"] == 0
