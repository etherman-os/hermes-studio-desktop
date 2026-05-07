"""Git worktree management repository.

Provides list/create/remove operations for git worktrees and stores metadata
in the Studio-owned ``studio.db`` so worktrees can be tracked across sessions.
"""

from __future__ import annotations

import re
import sqlite3
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from hermes_adapter.studio_storage import StudioStorage

_ID_RE = re.compile(r"^[A-Za-z0-9_.:/-]{1,500}$")
_BRANCH_RE = re.compile(r"^[A-Za-z0-9_./-]{1,200}$")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return f"wt_{uuid4().hex[:12]}"


def _run_git(args: list[str], cwd: Path, *, check: bool = False) -> subprocess.CompletedProcess[str]:
    """Run a git command and return the result."""
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=30,
        check=check,
    )


def _is_git_repo(path: Path) -> bool:
    try:
        result = _run_git(["rev-parse", "--is-inside-work-tree"], cwd=path)
        return result.returncode == 0 and result.stdout.strip() == "true"
    except (OSError, subprocess.TimeoutExpired):
        return False


def _parse_worktree_list(raw: str) -> list[dict[str, str]]:
    """Parse ``git worktree list --porcelain`` output."""
    worktrees: list[dict[str, str]] = []
    current: dict[str, str] = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            if current:
                worktrees.append(current)
                current = {}
            continue
        if line.startswith("worktree "):
            current["path"] = line[len("worktree "):]
        elif line.startswith("HEAD "):
            current["head"] = line[len("HEAD "):]
        elif line.startswith("branch "):
            current["branch"] = line[len("branch "):]
        elif line.startswith("bare"):
            current["bare"] = "true"
        elif line.startswith("detached"):
            current["detached"] = "true"
    if current:
        worktrees.append(current)
    return worktrees


class WorktreeRepository:
    """Manage git worktrees with Studio DB metadata tracking."""

    def __init__(self, storage: StudioStorage | None = None) -> None:
        self._storage = storage or StudioStorage()
        self._ensure_table()

    def _ensure_table(self) -> None:
        with self._storage.connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS worktrees (
                  id TEXT PRIMARY KEY,
                  workspace_path TEXT NOT NULL,
                  worktree_path TEXT NOT NULL,
                  branch TEXT,
                  head_hash TEXT,
                  status TEXT NOT NULL DEFAULT 'idle',
                  last_used_at TEXT,
                  run_count INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_worktrees_workspace ON worktrees(workspace_path)"
            )

    def list_worktrees(self, workspace_path: str) -> dict[str, Any]:
        """List worktrees for a workspace, syncing with git."""
        root = Path(workspace_path).expanduser().resolve(strict=False)
        if not root.is_dir() or not _is_git_repo(root):
            return {"worktrees": [], "is_git_repo": False, "workspace": workspace_path}

        # Sync from git
        result = _run_git(["worktree", "list", "--porcelain"], cwd=root)
        git_worktrees = _parse_worktree_list(result.stdout) if result.returncode == 0 else []

        now = _now_iso()
        with self._storage.connect() as conn:
            existing = {
                row["worktree_path"]: dict(row)
                for row in conn.execute(
                    "SELECT * FROM worktrees WHERE workspace_path = ?", (workspace_path,)
                ).fetchall()
            }

            seen_paths: set[str] = set()
            for wt in git_worktrees:
                wt_path = wt.get("path", "")
                if not wt_path:
                    continue
                seen_paths.add(wt_path)
                branch = wt.get("branch", "").replace("refs/heads/", "")
                head = wt.get("head", "")
                is_main = wt_path == str(root)

                if wt_path in existing:
                    conn.execute(
                        """
                        UPDATE worktrees
                        SET branch = ?, head_hash = ?, updated_at = ?
                        WHERE worktree_path = ? AND workspace_path = ?
                        """,
                        (branch or None, head or None, now, wt_path, workspace_path),
                    )
                else:
                    wt_id = _new_id()
                    conn.execute(
                        """
                        INSERT INTO worktrees (id, workspace_path, worktree_path, branch, head_hash, status, last_used_at, run_count, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                        """,
                        (
                            wt_id,
                            workspace_path,
                            wt_path,
                            branch or None,
                            head or None,
                            "main" if is_main else "idle",
                            now,
                            now,
                            now,
                        ),
                    )

            # Mark removed worktrees
            for path in set(existing.keys()) - seen_paths:
                conn.execute(
                    "DELETE FROM worktrees WHERE worktree_path = ? AND workspace_path = ?",
                    (path, workspace_path),
                )

            rows = conn.execute(
                "SELECT * FROM worktrees WHERE workspace_path = ? ORDER BY created_at DESC",
                (workspace_path,),
            ).fetchall()

        return {
            "worktrees": [self._row_to_dict(row) for row in rows],
            "is_git_repo": True,
            "workspace": workspace_path,
        }

    def create_worktree(
        self,
        workspace_path: str,
        branch: str,
        *,
        new_branch: bool = True,
    ) -> dict[str, Any]:
        """Create a new git worktree."""
        root = Path(workspace_path).expanduser().resolve(strict=False)
        if not root.is_dir() or not _is_git_repo(root):
            raise ValueError(f"Not a git repository: {workspace_path}")

        if not branch or not _BRANCH_RE.match(branch):
            raise ValueError(f"Invalid branch name: {branch}")

        # Determine worktree path
        safe_branch = branch.replace("/", "-")
        wt_path = root.parent / f"{root.name}.wt-{safe_branch}"

        cmd = ["worktree", "add"]
        if new_branch:
            cmd.extend(["-b", branch])
        cmd.append(str(wt_path))

        result = _run_git(cmd, cwd=root)
        if result.returncode != 0:
            error = result.stderr.strip() or "Failed to create worktree"
            raise RuntimeError(f"git worktree add failed: {error}")

        now = _now_iso()
        wt_id = _new_id()
        head_result = _run_git(["rev-parse", "HEAD"], cwd=wt_path)
        head = head_result.stdout.strip() if head_result.returncode == 0 else ""

        with self._storage.connect() as conn:
            conn.execute(
                """
                INSERT INTO worktrees (id, workspace_path, worktree_path, branch, head_hash, status, last_used_at, run_count, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'idle', ?, 0, ?, ?)
                """,
                (wt_id, workspace_path, str(wt_path), branch, head or None, now, now, now),
            )
            row = conn.execute("SELECT * FROM worktrees WHERE id = ?", (wt_id,)).fetchone()

        return self._row_to_dict(row)

    def remove_worktree(self, worktree_id: str) -> dict[str, Any]:
        """Remove a git worktree and its DB record."""
        with self._storage.connect() as conn:
            row = conn.execute("SELECT * FROM worktrees WHERE id = ?", (worktree_id,)).fetchone()
            if not row:
                raise ValueError(f"Worktree not found: {worktree_id}")

            wt_path = Path(row["worktree_path"])
            workspace_path = row["workspace_path"]
            root = Path(workspace_path).expanduser().resolve(strict=False)

            # Don't allow removing the main worktree
            if str(wt_path) == str(root):
                raise ValueError("Cannot remove the main worktree")

            result = _run_git(["worktree", "remove", "--force", str(wt_path)], cwd=root)
            if result.returncode != 0:
                error = result.stderr.strip() or "Failed to remove worktree"
                raise RuntimeError(f"git worktree remove failed: {error}")

            conn.execute("DELETE FROM worktrees WHERE id = ?", (worktree_id,))

        return {"removed": True, "id": worktree_id}

    def record_run(self, worktree_id: str) -> None:
        """Increment run count and update last_used_at."""
        with self._storage.connect() as conn:
            conn.execute(
                """
                UPDATE worktrees
                SET run_count = run_count + 1, last_used_at = ?, status = 'active', updated_at = ?
                WHERE id = ?
                """,
                (_now_iso(), _now_iso(), worktree_id),
            )

    def get_worktree(self, worktree_id: str) -> dict[str, Any] | None:
        """Get a single worktree by ID."""
        with self._storage.connect() as conn:
            row = conn.execute("SELECT * FROM worktrees WHERE id = ?", (worktree_id,)).fetchone()
            if not row:
                return None
            return self._row_to_dict(row)

    def set_status(self, worktree_id: str, status: str) -> None:
        with self._storage.connect() as conn:
            conn.execute(
                "UPDATE worktrees SET status = ?, updated_at = ? WHERE id = ?",
                (status, _now_iso(), worktree_id),
            )

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "workspace_path": row["workspace_path"],
            "worktree_path": row["worktree_path"],
            "branch": row["branch"],
            "head_hash": row["head_hash"],
            "status": row["status"],
            "last_used_at": row["last_used_at"],
            "run_count": row["run_count"],
            "created_at": row["created_at"],
        }
