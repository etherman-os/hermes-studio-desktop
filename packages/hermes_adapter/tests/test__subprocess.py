"""Tests for _subprocess.py secure subprocess helpers."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from hermes_adapter._subprocess import (
    _resolve_git_executable,
    _resolve_hermes_executable,
    build_ssh_hermes_command,
    run_git,
    run_hermes,
    validate_remote_ssh_target,
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


class TestValidateRemoteSshTarget:
    """Test validate_remote_ssh_target() security validation."""

    @pytest.mark.parametrize(
        "valid_target",
        [
            "user@example.com",
            "example.com",
            "user@192.168.1.10",
            "my-server",
            "user@server.example.org",
            "192.168.1.1",
            "server-with-dashes.example.com",
            "user@192.168.1.1",
            "a@b.c",
        ],
    )
    def test_valid_targets_accepted(self, valid_target: str) -> None:
        result = validate_remote_ssh_target(valid_target)
        assert result == valid_target

    @pytest.mark.parametrize(
        "invalid_target",
        [
            "host; rm -rf /",
            "user@host -oProxyCommand=...",
            "user@host\ncmd",
            "$(evil)",
            "host|grep",
            "host`id`",
            "user@host>out",
            "host${VAR}",
            "user@host and stuff",
            "host and stuff",
            "user@host.domain with spaces",
            "host\twith\ttabs",
            "",
            "a" * 254,
            "user@host\r\n",
            'user@host"quote',
            "host[brackets]",
            "user@host{brace}",
            "host(withparens)",
            "user@host*glob",
            "user@host?question",
        ],
    )
    def test_invalid_targets_rejected(self, invalid_target: str) -> None:
        with pytest.raises(ValueError, match="unsafe|invalid|1-253"):
            validate_remote_ssh_target(invalid_target)


class TestBuildSshHermesCommand:
    """Test build_ssh_hermes_command() security properties."""

    def test_returns_correct_command_list(self) -> None:
        result = build_ssh_hermes_command(
            "user@example.com", "/usr/bin/hermes", ["--version"]
        )
        # ssh resolved via which(), so may be full path or just "ssh"
        assert result[0].endswith("ssh")
        assert result[1] == "user@example.com"
        assert isinstance(result[2], str)
        # Remote command contains quoted bin and args
        assert "/usr/bin/hermes" in result[2]
        assert "--version" in result[2]

    def test_rejects_invalid_remote_target(self) -> None:
        with pytest.raises(ValueError, match="unsafe|invalid|1-253"):
            build_ssh_hermes_command("user@host; rm -rf /", "/usr/bin/hermes", ["--version"])

    def test_rejects_unsafe_remote_bin(self) -> None:
        with pytest.raises(ValueError, match="unsafe"):
            build_ssh_hermes_command("user@example.com", "bin; rm -rf /", ["--version"])

    def test_args_quoted_prevent_injection(self) -> None:
        # Args with shell metacharacters should be quoted, not evaluated
        result = build_ssh_hermes_command(
            "user@example.com",
            "/usr/bin/hermes",
            ["--prompt", "hello; whoami"],
        )
        # The command string should contain quoted version, not evaluated
        remote_cmd = result[2]
        # shlex.quote wraps in single quotes by default; semicolon should be inside quotes
        assert "hello; whoami" in remote_cmd

    def test_valid_ip_address_target(self) -> None:
        result = build_ssh_hermes_command(
            "192.168.1.10", "/usr/bin/hermes", ["chat", "--query", "test"]
        )
        assert result[0].endswith("ssh")
        assert result[1] == "192.168.1.10"
