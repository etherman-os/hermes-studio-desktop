"""Tests for read-only checkpoint repository."""

from __future__ import annotations

import subprocess
from pathlib import Path

from hermes_adapter.checkpoint_repository import (
    CheckpointRepository,
    _is_checkpoint_commit,
    _parse_shortstat,
)


def _make_git_repo(path: Path) -> None:
    """Initialize a git repo with checkpoint-like commits."""
    path.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init"], cwd=path, capture_output=True, check=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=path, capture_output=True, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=path, capture_output=True, check=True)

    (path / "README.md").write_text("# Project\n")
    subprocess.run(["git", "add", "."], cwd=path, capture_output=True, check=True)
    subprocess.run(["git", "commit", "-m", "initial commit"], cwd=path, capture_output=True, check=True)

    (path / "main.py").write_text("print('hello')\n")
    subprocess.run(["git", "add", "."], cwd=path, capture_output=True, check=True)
    subprocess.run(["git", "commit", "-m", "[checkpoint] Add main module"], cwd=path, capture_output=True, check=True)

    (path / "utils.py").write_text("def helper(): pass\n")
    subprocess.run(["git", "add", "."], cwd=path, capture_output=True, check=True)
    subprocess.run(["git", "commit", "-m", "cp/add-utils Add utility module"], cwd=path, capture_output=True, check=True)

    (path / "other.py").write_text("# other\n")
    subprocess.run(["git", "add", "."], cwd=path, capture_output=True, check=True)
    subprocess.run(["git", "commit", "-m", "Add other file"], cwd=path, capture_output=True, check=True)


def test_is_checkpoint_commit() -> None:
    assert _is_checkpoint_commit("[checkpoint] Something")
    assert _is_checkpoint_commit("[CHECKPOINT] Something")
    assert _is_checkpoint_commit("cp/feature-branch Description")
    assert not _is_checkpoint_commit("regular commit message")
    assert not _is_checkpoint_commit("fix: something")


def test_parse_shortstat() -> None:
    result = _parse_shortstat(" 3 files changed, 50 insertions(+), 10 deletions(-)")
    assert result["files"] == 3
    assert result["insertions"] == 50
    assert result["deletions"] == 10

    result2 = _parse_shortstat(" 1 file changed, 5 insertions(+)")
    assert result2["files"] == 1
    assert result2["insertions"] == 5
    assert result2["deletions"] == 0


def test_list_checkpoints(tmp_path: Path) -> None:
    repo_path = tmp_path / "project"
    _make_git_repo(repo_path)

    repo = CheckpointRepository()
    result = repo.list_checkpoints(str(repo_path))

    assert result["is_git_repo"] is True
    assert result["total"] == 2
    messages = [cp["message"] for cp in result["checkpoints"]]
    assert any("[checkpoint]" in m for m in messages)
    assert any(m.startswith("cp/") for m in messages)


def test_list_checkpoints_non_git(tmp_path: Path) -> None:
    not_repo = tmp_path / "not-a-repo"
    not_repo.mkdir()

    repo = CheckpointRepository()
    result = repo.list_checkpoints(str(not_repo))

    assert result["is_git_repo"] is False
    assert result["checkpoints"] == []


def test_get_checkpoint(tmp_path: Path) -> None:
    repo_path = tmp_path / "project"
    _make_git_repo(repo_path)

    repo = CheckpointRepository()
    listing = repo.list_checkpoints(str(repo_path))
    assert listing["checkpoints"]

    first = listing["checkpoints"][0]
    detail = repo.get_checkpoint(str(repo_path), first["hash"])
    assert detail["hash"] == first["hash"]
    assert detail["message"] == first["message"]


def test_get_checkpoint_not_found(tmp_path: Path) -> None:
    repo_path = tmp_path / "project"
    _make_git_repo(repo_path)

    repo = CheckpointRepository()
    import pytest
    with pytest.raises(ValueError, match="Commit not found"):
        repo.get_checkpoint(str(repo_path), "deadbeef" * 5)


def test_get_diff(tmp_path: Path) -> None:
    repo_path = tmp_path / "project"
    _make_git_repo(repo_path)

    repo = CheckpointRepository()
    listing = repo.list_checkpoints(str(repo_path))
    assert listing["checkpoints"]

    first = listing["checkpoints"][0]
    diff = repo.get_diff(str(repo_path), first["hash"])
    assert "hash" in diff
    assert "files" in diff
    assert isinstance(diff["files"], list)
