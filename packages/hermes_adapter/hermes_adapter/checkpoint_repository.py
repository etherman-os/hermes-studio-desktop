"""Read-only checkpoint timeline repository.

Reads git checkpoints/tags from a workspace directory.  Checkpoint-like commits
are identified by a ``[checkpoint]`` tag or a ``cp/`` prefix in the commit
message.  This module performs *no* git mutations.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_CHECKPOINT_RE = re.compile(r"\[checkpoint\]", re.IGNORECASE)
_CP_PREFIX_RE = re.compile(r"^cp/", re.IGNORECASE)
_MAX_DIFF_LINES = 500


@dataclass(frozen=True)
class Checkpoint:
    """Immutable checkpoint metadata."""

    hash: str
    short_hash: str
    message: str
    timestamp: str
    author: str
    files_changed: int
    insertions: int
    deletions: int
    is_head: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "hash": self.hash,
            "short_hash": self.short_hash,
            "message": self.message,
            "timestamp": self.timestamp,
            "author": self.author,
            "files_changed": self.files_changed,
            "insertions": self.insertions,
            "deletions": self.deletions,
            "is_head": self.is_head,
        }


def _run_git(args: list[str], cwd: Path) -> str:
    """Run a git command and return stdout.  Returns empty string on failure."""
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if result.returncode != 0:
            return ""
        return result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return ""


def _is_git_repo(path: Path) -> bool:
    return bool(_run_git(["rev-parse", "--is-inside-work-tree"], cwd=path).strip())


def _head_hash(cwd: Path) -> str:
    return _run_git(["rev-parse", "HEAD"], cwd=cwd).strip()


class CheckpointRepository:
    """Read-only checkpoint timeline backed by git log."""

    def list_checkpoints(self, workspace_path: str, *, limit: int = 100) -> dict[str, Any]:
        """Return checkpoint-like commits for *workspace_path*."""
        root = Path(workspace_path).expanduser().resolve(strict=False)
        if not root.is_dir() or not _is_git_repo(root):
            return {"checkpoints": [], "total": 0, "workspace": workspace_path, "is_git_repo": False}

        head = _head_hash(root)
        log_format = "%H%n%h%n%s%n%aI%n%an"
        raw = _run_git(
            [
                "log",
                f"--pretty=format:{log_format}",
                "--all",
                "-n",
                str(min(limit * 5, 1000)),
            ],
            cwd=root,
        )
        if not raw.strip():
            return {"checkpoints": [], "total": 0, "workspace": workspace_path, "is_git_repo": True}

        checkpoints: list[Checkpoint] = []
        lines = raw.splitlines()
        i = 0
        while i + 4 < len(lines) and len(checkpoints) < limit:
            full_hash = lines[i].strip()
            short_hash = lines[i + 1].strip()
            message = lines[i + 2].strip()
            timestamp = lines[i + 3].strip()
            author = lines[i + 4].strip()
            i += 5

            if not _is_checkpoint_commit(message):
                continue

            stats = _commit_file_stats(root, full_hash)
            checkpoints.append(
                Checkpoint(
                    hash=full_hash,
                    short_hash=short_hash,
                    message=message,
                    timestamp=timestamp,
                    author=author,
                    files_changed=stats["files"],
                    insertions=stats["insertions"],
                    deletions=stats["deletions"],
                    is_head=(full_hash == head),
                )
            )

        return {
            "checkpoints": [cp.to_dict() for cp in checkpoints],
            "total": len(checkpoints),
            "workspace": workspace_path,
            "is_git_repo": True,
        }

    def get_checkpoint(self, workspace_path: str, commit_hash: str) -> dict[str, Any]:
        """Return details for a single checkpoint commit."""
        root = Path(workspace_path).expanduser().resolve(strict=False)
        if not root.is_dir() or not _is_git_repo(root):
            raise ValueError(f"Not a git repository: {workspace_path}")

        head = _head_hash(root)
        log_format = "%H%n%h%n%s%n%aI%n%an"
        raw = _run_git(
            ["log", "-1", f"--pretty=format:{log_format}", commit_hash],
            cwd=root,
        )
        if not raw.strip():
            raise ValueError(f"Commit not found: {commit_hash}")

        lines = raw.splitlines()
        if len(lines) < 5:
            raise ValueError(f"Commit not found: {commit_hash}")

        full_hash = lines[0].strip()
        short_hash = lines[1].strip()
        message = lines[2].strip()
        timestamp = lines[3].strip()
        author = lines[4].strip()
        stats = _commit_file_stats(root, full_hash)

        return Checkpoint(
            hash=full_hash,
            short_hash=short_hash,
            message=message,
            timestamp=timestamp,
            author=author,
            files_changed=stats["files"],
            insertions=stats["insertions"],
            deletions=stats["deletions"],
            is_head=(full_hash == head),
        ).to_dict()

    def get_diff(self, workspace_path: str, commit_hash: str) -> dict[str, Any]:
        """Return a diff preview for a checkpoint commit."""
        root = Path(workspace_path).expanduser().resolve(strict=False)
        if not root.is_dir() or not _is_git_repo(root):
            raise ValueError(f"Not a git repository: {workspace_path}")

        stat_raw = _run_git(["diff", "--stat", f"{commit_hash}~1..{commit_hash}"], cwd=root)
        diff_raw = _run_git(
            ["diff", f"{commit_hash}~1..{commit_hash}"],
            cwd=root,
        )
        files_raw = _run_git(["diff", "--name-only", f"{commit_hash}~1..{commit_hash}"], cwd=root)

        files = [f.strip() for f in files_raw.splitlines() if f.strip()]
        diff_lines = diff_raw.splitlines()[:_MAX_DIFF_LINES] if diff_raw else []

        return {
            "hash": commit_hash,
            "stat": stat_raw.strip() if stat_raw else "",
            "diff": "\n".join(diff_lines),
            "files": files,
            "truncated": len(diff_raw.splitlines()) > _MAX_DIFF_LINES if diff_raw else False,
        }


def _is_checkpoint_commit(message: str) -> bool:
    return bool(_CHECKPOINT_RE.search(message) or _CP_PREFIX_RE.match(message))


def _commit_file_stats(cwd: Path, commit_hash: str) -> dict[str, int]:
    """Return files changed, insertions, deletions for a commit."""
    raw = _run_git(["diff", "--shortstat", f"{commit_hash}~1..{commit_hash}"], cwd=cwd)
    if not raw.strip():
        return {"files": 0, "insertions": 0, "deletions": 0}
    return _parse_shortstat(raw)


def _parse_shortstat(text: str) -> dict[str, int]:
    """Parse git diff --shortstat output."""
    result = {"files": 0, "insertions": 0, "deletions": 0}
    files_match = re.search(r"(\d+) files? changed", text)
    if files_match:
        result["files"] = int(files_match.group(1))
    ins_match = re.search(r"(\d+) insertions?", text)
    if ins_match:
        result["insertions"] = int(ins_match.group(1))
    del_match = re.search(r"(\d+) deletions?", text)
    if del_match:
        result["deletions"] = int(del_match.group(1))
    return result
