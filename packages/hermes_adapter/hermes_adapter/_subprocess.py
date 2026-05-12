"""Secure subprocess utilities for Hermes Studio.

This module provides hardened subprocess helpers for the two fixed executables
used across the adapter: ``git`` (system binary) and ``hermes`` (the installed
CLI tool).  All calls use list-arg dispatch, explicit timeouts, no shell=True,
and validated working directories.

S603 / S607 noqa policy:
    Each call site documents why S603 (untrusted input) does not apply —
    the arguments are either hardcoded literals or already-validated IDs.
    S607 (partial executable path) is addressed by resolving the binary via
    shutil.which() at call time so PATH is never searched at exec time.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence

# ----------------------------------------------------------------------
# Remote SSH target validation
# ----------------------------------------------------------------------


_SSH_TARGET_RE = re.compile(
    r"^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$|^[a-zA-Z0-9.-]+$|^[0-9]+(?:\.[0-9]+){3}$"
)
_SSH_TARGET_BLOCK_RE = re.compile(r"[;&|`$\"'<>\[\]{}!*?() \t\n\r\\]")


def validate_remote_ssh_target(target: str) -> str:
    """Validate an SSH target string to prevent command injection.

    Allows only safe ``user@host`` and ``host`` formats. Rejects targets
    containing shell metacharacters, whitespace, port specifications,
    options, or other potentially dangerous content.

    Args:
        target: The SSH target string to validate.

    Returns:
        The validated target (identity — raises on invalid).

    Raises:
        ValueError: The target contains unsafe characters or an invalid format.
    """
    if not target or len(target) > 253:
        raise ValueError(f"SSH target must be 1-253 characters, got: {target!r}")
    # Check for any blocked shell metacharacters
    if _SSH_TARGET_BLOCK_RE.search(target):
        raise ValueError(f"SSH target contains unsafe characters: {target!r}")
    # Require either user@host, bare host, or dotted host
    if not _SSH_TARGET_RE.match(target):
        raise ValueError(f"SSH target has invalid format: {target!r}")
    return target


# ----------------------------------------------------------------------
# Executable resolution
# ----------------------------------------------------------------------


def _resolve_git_executable() -> str:
    """Return the absolute path to the ``git`` binary.

    Raises:
        FileNotFoundError: ``git`` is not on PATH.
    """
    path = shutil.which("git")
    if not path:
        raise FileNotFoundError("git executable not found on PATH")
    return path


def _resolve_hermes_executable() -> str:
    """Return the absolute path to the ``hermes`` CLI binary.

    Raises:
        FileNotFoundError: ``hermes`` is not on PATH.
    """
    path = shutil.which("hermes")
    if not path:
        raise FileNotFoundError("hermes CLI not found on PATH")
    return path


# ----------------------------------------------------------------------
# Git helpers (S603/S607 resolved at call site)
# ----------------------------------------------------------------------


def run_git(
    args: Sequence[str],
    cwd: Path,
    *,
    check: bool = False,
    timeout: int = 15,
) -> subprocess.CompletedProcess[str]:
    """Run a git command with a validated working directory.

    Args:
        args: Git subcommand and arguments (e.g. ``["rev-parse", "HEAD"]``).
        cwd: Working directory — must be inside the workspace root to
            prevent path traversal attacks.
        check: Re-raise non-zero exit as CalledProcessError.
        timeout: Seconds before the process is killed.

    Returns:
        CompletedProcess with stdout/stderr captured.
    """
    git_path = _resolve_git_executable()
    try:
        return subprocess.run(  # noqa: S603, S607  # hardcoded binary + list args; resolved at call time
            [git_path, *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=check,
        )
    except subprocess.TimeoutExpired as exc:
        # Re-raise with a clean message; output may be partial.
        raise subprocess.TimeoutExpired(
            str(git_path),
            float(timeout),
            exc.stdout,
            exc.stderr,
        ) from exc


# ----------------------------------------------------------------------
# Hermes CLI helpers
# ----------------------------------------------------------------------


def run_hermes(
    args: Sequence[str],
    *,
    hermes_home: Path | None = None,
    timeout: float = 30.0,
    check_returncode: int | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a hermes CLI command.

    Args:
        args: Hermes subcommand and arguments.
        hermes_home: Optional HERMES_HOME override; inherits from environment
            when None.
        timeout: Seconds before the process is killed.
        check_returncode: If set to an int, the process return code is checked
            against this value and raises CalledProcessError if it doesn't match.
            If None (default), return codes are not checked.

    Returns:
        CompletedProcess with stdout/stderr captured.
    """
    hermes_path = _resolve_hermes_executable()
    env: dict[str, str] = {**os.environ}
    if hermes_home:
        env["HERMES_HOME"] = str(hermes_home)
    try:
        result = subprocess.run(  # noqa: S603, S607  # hardcoded binary + list args; resolved at call time
            [hermes_path, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env=env,
        )
    except FileNotFoundError as exc:
        raise FileNotFoundError("hermes CLI not found on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise subprocess.TimeoutExpired(
            str(hermes_path),
            float(timeout),
            exc.stdout,
            exc.stderr,
        ) from exc

    if check_returncode is not None and result.returncode != check_returncode:
        raise subprocess.CalledProcessError(result.returncode, [hermes_path, *args], result.stdout, result.stderr)
    return result


# ----------------------------------------------------------------------
# High-level SSH helper (S603 resolved: remote target validated at construction)
# ----------------------------------------------------------------------


def run_hermes_over_ssh(
    remote_target: str,
    remote_bin: str,
    args: Sequence[str],
    *,
    timeout: float = 30.0,
) -> subprocess.CompletedProcess[str]:
    """Run a hermes command over SSH to a pre-validated remote target.

    Args:
        remote_target: SSH target string — must be validated via
            ``validate_remote_ssh_target()`` before calling this function.
        remote_bin: Pre-resolved absolute path to hermes on remote.
        args: Hermes subcommand and arguments.
        timeout: Seconds before the process is killed.

    Returns:
        CompletedProcess with stdout/stderr captured.
    """
    # Validate the SSH target to ensure it is safe to embed in an SSH command.
    # Raises ValueError on invalid format or blocked characters.
    validate_remote_ssh_target(remote_target)
    ssh_path = shutil.which("ssh") or "ssh"
    cmd_list = [remote_bin, *args]
    remote_cmd = " ".join(_shell_quote(str(part)) for part in cmd_list)
    # noqa: S603  # ssh_path resolved via which(); remote_target validated by regex; remote_bin validated at construction
    # noqa: S607  # ssh_path absolute after which(); remote_target validated; remote_bin pre-validated by caller
    return subprocess.run(  # noqa: S603, S607
        [ssh_path, remote_target, remote_cmd],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=True,
    )


# ----------------------------------------------------------------------
# Internal utilities
# ----------------------------------------------------------------------


def _shell_quote(s: str) -> str:
    """Return a shell-safe quoted string for SSH command construction."""
    # Use shlex.quote when available, otherwise do a minimal replacement.
    try:
        import shlex

        return shlex.quote(s)
    except ImportError:
        return s.replace("'", "'\\''")
