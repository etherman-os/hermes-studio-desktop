"""Tests for _subprocess.py secure subprocess helpers."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from hermes_adapter._subprocess import (
    _resolve_git_executable,
    _resolve_hermes_executable,
    run_git,
    run_hermes,
)


def _hermes_available() -> bool:
    return shutil.which("hermes") is not None


class TestResolveGit:
    def test_git_resolves_to_absolute_path(self) -> None:
        path = _resolve_git_executable()
        assert Path(path).is_absolute()

    def test_git_resolved_path_is_executable(self) -> None:
        path = _resolve_git_executable()
        assert Path(path).exists()
        assert Path(path).stat().st_mode & 0o111  # executable bit


class TestResolveHermes:
    @pytest.mark.skipif(not _hermes_available(), reason="hermes CLI not on PATH in CI")
    def test_hermes_resolves_to_absolute_path(self) -> None:
        path = _resolve_hermes_executable()
        assert Path(path).is_absolute()

    @pytest.mark.skipif(not _hermes_available(), reason="hermes CLI not on PATH in CI")
    def test_hermes_resolved_path_is_executable(self) -> None:
        path = _resolve_hermes_executable()
        assert Path(path).exists()
        assert Path(path).stat().st_mode & 0o111


class TestRunGit:
    def test_git_version_succeeds(self, tmp_path: Path) -> None:
        result = run_git(["--version"], cwd=tmp_path, timeout=10)
        assert result.returncode == 0
        assert "git" in result.stdout.lower()

    def test_git_rev_parse_head(self, tmp_path: Path) -> None:
        result = run_git(["rev-parse", "--is-inside-work-tree"], cwd=tmp_path, timeout=10)
        # Not a git repo, so returns empty on failure — returncode 128
        # but the function doesn't raise, it returns CompletedProcess
        assert result.returncode in (0, 128)


class TestRunHermes:
    @pytest.mark.skipif(not _hermes_available(), reason="hermes CLI not on PATH in CI")
    def test_hermes_version_succeeds(self) -> None:
        result = run_hermes(["--version"], timeout=10)
        assert result.returncode == 0
        assert "hermes" in result.stdout.lower()

    @pytest.mark.skipif(not _hermes_available(), reason="hermes CLI not on PATH in CI")
    def test_unknown_subcommand_fails(self) -> None:
        result = run_hermes(["this-is-not-a-command"], timeout=10)
        # Hermes exits non-zero for unknown subcommand
        assert result.returncode != 0
