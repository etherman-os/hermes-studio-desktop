"""Tests for git worktree management repository."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from hermes_adapter.studio_storage import StudioStorage
from hermes_adapter.worktree_repository import WorktreeRepository


def _make_git_repo(path: Path) -> None:
    """Initialize a git repo with an initial commit."""
    path.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init"], cwd=path, capture_output=True, check=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=path, capture_output=True, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=path, capture_output=True, check=True)
    (path / "README.md").write_text("# Project\n")
    subprocess.run(["git", "add", "."], cwd=path, capture_output=True, check=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=path, capture_output=True, check=True)


def _repo(tmp_path: Path) -> WorktreeRepository:
    return WorktreeRepository(StudioStorage(data_dir=tmp_path / "studio-data"))


def test_list_worktrees_non_git(tmp_path: Path) -> None:
    not_repo = tmp_path / "not-a-repo"
    not_repo.mkdir()
    repo = _repo(tmp_path)
    result = repo.list_worktrees(str(not_repo))
    assert result["is_git_repo"] is False
    assert result["worktrees"] == []


def test_list_worktrees(tmp_path: Path) -> None:
    project = tmp_path / "project"
    _make_git_repo(project)
    repo = _repo(tmp_path)

    result = repo.list_worktrees(str(project))
    assert result["is_git_repo"] is True
    assert len(result["worktrees"]) >= 1
    main_wt = result["worktrees"][0]
    assert main_wt["status"] == "main"
    assert main_wt["worktree_path"] == str(project)


def test_create_and_remove_worktree(tmp_path: Path) -> None:
    project = tmp_path / "project"
    _make_git_repo(project)
    repo = _repo(tmp_path)

    wt = repo.create_worktree(str(project), "feature-test")
    assert wt["branch"] == "feature-test"
    assert wt["status"] == "idle"
    assert Path(wt["worktree_path"]).exists()

    listing = repo.list_worktrees(str(project))
    assert len(listing["worktrees"]) == 2

    result = repo.remove_worktree(wt["id"])
    assert result["removed"] is True

    listing2 = repo.list_worktrees(str(project))
    assert len(listing2["worktrees"]) == 1


def test_cannot_remove_main_worktree(tmp_path: Path) -> None:
    project = tmp_path / "project"
    _make_git_repo(project)
    repo = _repo(tmp_path)

    listing = repo.list_worktrees(str(project))
    main_wt = listing["worktrees"][0]

    with pytest.raises(ValueError, match="Cannot remove the main worktree"):
        repo.remove_worktree(main_wt["id"])


def test_invalid_branch_name(tmp_path: Path) -> None:
    project = tmp_path / "project"
    _make_git_repo(project)
    repo = _repo(tmp_path)

    with pytest.raises(ValueError, match="Invalid branch name"):
        repo.create_worktree(str(project), "")


def test_not_git_repo(tmp_path: Path) -> None:
    not_repo = tmp_path / "not-a-repo"
    not_repo.mkdir()
    repo = _repo(tmp_path)

    with pytest.raises(ValueError, match="Not a git repository"):
        repo.create_worktree(str(not_repo), "test-branch")


def test_record_run(tmp_path: Path) -> None:
    project = tmp_path / "project"
    _make_git_repo(project)
    repo = _repo(tmp_path)

    wt = repo.create_worktree(str(project), "run-test")
    assert wt["run_count"] == 0

    repo.record_run(wt["id"])
    listing = repo.list_worktrees(str(project))
    updated = next(w for w in listing["worktrees"] if w["id"] == wt["id"])
    assert updated["run_count"] == 1
    assert updated["status"] == "active"
