"""Read-only Context Inspector aggregation service."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped, unused-ignore]

from hermes_adapter.approval_repository import ApprovalRepository
from hermes_adapter.artifact_repository import ArtifactRepository
from hermes_adapter.backend_base import StudioBackend
from hermes_adapter.kanban_repository import KanbanRepository
from hermes_adapter.run_ledger_repository import RunLedgerRepository
from hermes_adapter.studio_storage import StudioStorage

logger = logging.getLogger("hermes_adapter.context_repository")

_CONTEXT_FILES = ("SOUL.md", "AGENTS.md", "CLAUDE.md", "README.md", "package.json", "pyproject.toml", "Cargo.toml")
_MAX_PREVIEW_CHARS = 1600
_SECRET_PATTERNS = (
    re.compile(r"Bearer\s+[A-Za-z0-9._:-]+", re.IGNORECASE),
    re.compile(r"(?i)\b(sk-|xai-|tvly-)[a-zA-Z0-9._-]+"),
    re.compile(r"(?i)\b(api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[^'\"\\s]+"),
    re.compile(r"\b[a-f0-9]{32,}\b", re.IGNORECASE),
)

# YAML frontmatter delimiter pattern
_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def _now_id() -> str:
    return datetime.now(UTC).strftime("ctx_%Y%m%d%H%M%S%f")


def _redact(value: str) -> str:
    redacted = value
    for pattern in _SECRET_PATTERNS:
        redacted = pattern.sub("[REDACTED]", redacted)
    return redacted


def _path_name(path: str | None) -> str | None:
    if not path:
        return None
    try:
        return Path(path).name or path
    except (OSError, ValueError):
        return path


class ContextRepository:
    """Aggregate read-only Studio/Hermes context into one normalized snapshot."""

    def __init__(self, storage: StudioStorage | None = None) -> None:
        self._storage = storage or StudioStorage()
        self._runs = RunLedgerRepository(self._storage)
        self._artifacts = ArtifactRepository(self._storage)
        self._kanban = KanbanRepository(self._storage)
        self._approvals = ApprovalRepository(self._storage)

    async def current(
        self,
        backend: StudioBackend,
        backend_status: dict[str, Any],
        *,
        workspace_path: str | None = None,
    ) -> dict[str, Any]:
        warnings: list[str] = []
        recent = self._safe_recent_runs(warnings)
        if not workspace_path:
            workspace_path = self._latest_workspace_path(recent.get("runs", []))
        return await self._snapshot(
            backend,
            backend_status,
            scope="current",
            workspace_path=workspace_path,
            run=None,
            session=None,
            related_runs=recent.get("runs", [])[:10],
            warnings=warnings,
        )

    async def workspace_current(
        self,
        backend: StudioBackend,
        backend_status: dict[str, Any],
        *,
        workspace_path: str | None = None,
    ) -> dict[str, Any]:
        snapshot = await self.current(backend, backend_status, workspace_path=workspace_path)
        snapshot["scope"] = "workspace"
        return snapshot

    async def for_run(self, backend: StudioBackend, backend_status: dict[str, Any], run_id: str) -> dict[str, Any]:
        warnings: list[str] = []
        run = self._safe_run(run_id, warnings)
        session = None
        if run and run.get("session_id"):
            session = await self._safe_session(backend, str(run["session_id"]), warnings)
        return await self._snapshot(
            backend,
            backend_status,
            scope="run",
            workspace_path=str(run.get("workspace_path")) if run and run.get("workspace_path") else None,
            run=run,
            session=session,
            related_runs=[run] if run else [],
            warnings=warnings,
        )

    async def for_session(self, backend: StudioBackend, backend_status: dict[str, Any], session_id: str) -> dict[str, Any]:
        warnings: list[str] = []
        session = await self._safe_session(backend, session_id, warnings)
        recent = self._safe_recent_runs(warnings)
        related_runs = [run for run in recent.get("runs", []) if run.get("session_id") == session_id]
        workspace_path = self._latest_workspace_path(related_runs)
        return await self._snapshot(
            backend,
            backend_status,
            scope="session",
            workspace_path=workspace_path,
            run=related_runs[0] if related_runs else None,
            session=session,
            related_runs=related_runs,
            warnings=warnings,
        )

    async def _snapshot(
        self,
        backend: StudioBackend,
        backend_status: dict[str, Any],
        *,
        scope: str,
        workspace_path: str | None,
        run: dict[str, Any] | None,
        session: dict[str, Any] | None,
        related_runs: list[dict[str, Any]],
        warnings: list[str],
    ) -> dict[str, Any]:
        active_profile = await self._safe_active_profile(backend, warnings)
        model = await self._safe_model(backend, warnings)
        runtime = await self._safe_runtime(backend, backend_status, warnings)
        workspace = self._workspace(workspace_path, warnings)
        context_files = self._context_files(workspace_path, warnings)
        memory = self._read_memory(warnings)
        skills = self._read_skills(warnings)
        related = self._related(run=run, session=session, related_runs=related_runs, warnings=warnings)

        if not workspace_path:
            warnings.append("No workspace path selected; project context files are unavailable.")

        return {
            "id": _now_id(),
            "scope": scope,
            "active_profile": active_profile,
            "model": model,
            "runtime": runtime,
            "storage": self._storage.status().to_dict(),
            "workspace": workspace,
            "session": session,
            "run": run,
            "memory": memory,
            "skills": skills,
            "context_files": context_files,
            "related": related,
            "warnings": list(dict.fromkeys(warnings)),
        }

    async def _safe_active_profile(self, backend: StudioBackend, warnings: list[str]) -> dict[str, Any] | None:
        try:
            return await backend.get_active_profile()
        except Exception as exc:
            warnings.append(f"Active profile unavailable: {exc}")
            return None

    async def _safe_model(self, backend: StudioBackend, warnings: list[str]) -> dict[str, Any] | None:
        try:
            return await backend.get_model_config()
        except Exception as exc:
            warnings.append(f"Model/provider config unavailable: {exc}")
            return None

    async def _safe_runtime(
        self,
        backend: StudioBackend,
        backend_status: dict[str, Any],
        warnings: list[str],
    ) -> dict[str, Any]:
        runtime: dict[str, Any] = {"backend_status": backend_status}
        try:
            health = await backend.health()
            runtime["health"] = health
        except Exception as exc:
            warnings.append(f"Runtime health unavailable: {exc}")
        return runtime

    async def _safe_session(
        self,
        backend: StudioBackend,
        session_id: str,
        warnings: list[str],
    ) -> dict[str, Any] | None:
        try:
            return await backend.get_session(session_id)
        except Exception as exc:
            warnings.append(f"Session context unavailable for {session_id}: {exc}")
            return {"id": session_id, "available": False}

    def _safe_recent_runs(self, warnings: list[str]) -> dict[str, Any]:
        try:
            return self._runs.get_recent_runs(limit=100)
        except Exception as exc:
            warnings.append(f"Run history unavailable: {exc}")
            return {"runs": [], "total": 0, "history_available": False}

    def _safe_run(self, run_id: str, warnings: list[str]) -> dict[str, Any] | None:
        try:
            return self._runs.get_run(run_id)
        except Exception as exc:
            warnings.append(f"Run context unavailable for {run_id}: {exc}")
            return None

    def _related(
        self,
        *,
        run: dict[str, Any] | None,
        session: dict[str, Any] | None,
        related_runs: list[dict[str, Any]],
        warnings: list[str],
    ) -> dict[str, Any]:
        run_id = str(run["id"]) if run and run.get("id") else None
        session_id = str(session["id"]) if session and session.get("id") else None
        artifacts: list[dict[str, Any]] = []
        cards: list[dict[str, Any]] = []
        approvals: list[dict[str, Any]] = []
        try:
            if run_id:
                artifacts.extend(self._artifacts.list_artifacts(run_id=run_id, limit=50)["artifacts"])
                cards.extend(self._kanban.find_cards(run_id=run_id, limit=50))
                approvals.extend(self._approvals.list_approvals_for_run(run_id)["approvals"])
            if session_id:
                artifacts.extend(self._artifacts.list_artifacts(session_id=session_id, limit=50)["artifacts"])
                cards.extend(self._kanban.find_cards(session_id=session_id, limit=50))
                approvals.extend(self._approvals.list_approvals_for_session(session_id)["approvals"])
        except Exception as exc:
            warnings.append(f"Related workflow context unavailable: {exc}")

        return {
            "artifacts": self._dedupe_by_id(artifacts),
            "kanban_cards": self._dedupe_by_id(cards),
            "approvals": self._dedupe_by_id(approvals),
            "sessions": [session] if session else [],
            "runs": self._dedupe_by_id(related_runs),
        }

    @staticmethod
    def _dedupe_by_id(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in items:
            item_id = str(item.get("id", ""))
            if not item_id or item_id in seen:
                continue
            seen.add(item_id)
            result.append(item)
        return result

    @staticmethod
    def _latest_workspace_path(runs: list[dict[str, Any]]) -> str | None:
        for run in runs:
            workspace_path = run.get("workspace_path")
            if isinstance(workspace_path, str) and workspace_path:
                return workspace_path
        return None

    def _workspace(self, workspace_path: str | None, warnings: list[str]) -> dict[str, Any]:
        if not workspace_path:
            return {"available": False, "path": None, "name": None}
        root = self._safe_workspace_root(workspace_path, warnings)
        return {
            "available": bool(root and root.exists() and root.is_dir()),
            "path": str(root) if root else workspace_path,
            "name": _path_name(str(root) if root else workspace_path),
        }

    def _context_files(self, workspace_path: str | None, warnings: list[str]) -> dict[str, Any]:
        root = self._safe_workspace_root(workspace_path, warnings)
        if root is None:
            return {
                "items": [{"name": name, "path": None, "available": False, "preview": None} for name in _CONTEXT_FILES],
                "warnings": ["No readable workspace selected."],
            }

        items: list[dict[str, Any]] = []
        file_warnings: list[str] = []
        for name in _CONTEXT_FILES:
            candidate = root / name
            item = {"name": name, "path": str(candidate), "available": False, "preview": None}
            try:
                if candidate.is_symlink():
                    item["warning"] = "Symlink context files are not followed."
                    file_warnings.append(f"{name} is a symlink and was skipped.")
                elif candidate.exists() and candidate.is_file() and self._is_inside_root(candidate, root):
                    preview = candidate.read_text(encoding="utf-8", errors="replace")[:_MAX_PREVIEW_CHARS]
                    item["available"] = True
                    item["preview"] = _redact(preview)
                    if preview != item["preview"]:
                        item["redacted"] = True
                        file_warnings.append(f"{name} preview was redacted.")
                elif candidate.exists():
                    item["warning"] = "Not a regular file."
            except OSError as exc:
                item["warning"] = str(exc)
                file_warnings.append(f"{name} unavailable: {exc}")
            items.append(item)
        return {"items": items, "warnings": file_warnings}

    def _read_memory(self, warnings: list[str]) -> dict[str, Any]:
        """Read memory entries from ~/.hermes/memories/."""
        hermes_home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
        memories_dir = hermes_home / "memories"
        if not memories_dir.is_dir():
            return {"available": False, "items": [], "warnings": ["No memories directory found."]}

        items: list[dict[str, Any]] = []
        mem_warnings: list[str] = []
        try:
            for entry in sorted(memories_dir.iterdir(), reverse=True):
                if entry.is_file():
                    item = self._parse_memory_entry(entry, mem_warnings)
                    if item:
                        items.append(item)
        except OSError as exc:
            mem_warnings.append(f"Error reading memories: {exc}")
            logger.warning("Failed to read memories dir: %s", exc)

        warnings.extend(mem_warnings)
        return {
            "available": len(items) > 0,
            "items": items[:50],  # Limit to 50 entries
            "total": len(items),
            "warnings": mem_warnings if mem_warnings else [],
        }

    def _parse_memory_entry(self, path: Path, warnings: list[str]) -> dict[str, Any] | None:
        """Parse a single memory entry file."""
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            # Try JSON first
            if content.strip().startswith("{"):
                try:
                    data = json.loads(content)
                    return {
                        "id": path.stem,
                        "type": data.get("type", "note"),
                        "content": _redact(data.get("content", content[:_MAX_PREVIEW_CHARS])),
                        "tags": data.get("tags", []),
                        "created_at": data.get("created_at", ""),
                        "source": str(path.name),
                    }
                except json.JSONDecodeError:
                    pass
            # Plain text
            return {
                "id": path.stem,
                "type": "text",
                "content": _redact(content[:_MAX_PREVIEW_CHARS]),
                "tags": [],
                "created_at": "",
                "source": str(path.name),
            }
        except OSError as exc:
            warnings.append(f"Memory file {path.name} unreadable: {exc}")
            return None

    def _read_skills(self, warnings: list[str]) -> dict[str, Any]:
        """Read skill manifests from ~/.hermes/skills/."""
        hermes_home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
        skills_dir = hermes_home / "skills"
        if not skills_dir.is_dir():
            return {"available": False, "items": [], "warnings": ["No skills directory found."]}

        items: list[dict[str, Any]] = []
        skill_warnings: list[str] = []
        try:
            for entry in sorted(skills_dir.iterdir()):
                if entry.is_dir():
                    skill = self._parse_skill_manifest(entry, skill_warnings)
                    if skill:
                        items.append(skill)
                elif entry.is_file() and entry.suffix in (".json", ".yaml", ".yml"):
                    skill = self._parse_skill_file(entry, skill_warnings)
                    if skill:
                        items.append(skill)
        except OSError as exc:
            skill_warnings.append(f"Error reading skills: {exc}")
            logger.warning("Failed to read skills dir: %s", exc)

        warnings.extend(skill_warnings)
        return {
            "available": len(items) > 0,
            "items": items,
            "total": len(items),
            "warnings": skill_warnings if skill_warnings else [],
        }

    def _parse_skill_manifest(self, skill_dir: Path, warnings: list[str]) -> dict[str, Any] | None:
        """Parse a skill directory manifest."""
        manifest_candidates = [
            skill_dir / "manifest.json",
            skill_dir / "skill.json",
            skill_dir / "manifest.yaml",
            skill_dir / "manifest.yml",
        ]
        for candidate in manifest_candidates:
            if candidate.is_file():
                try:
                    content = candidate.read_text(encoding="utf-8", errors="replace")
                    data = json.loads(content) if content.strip().startswith("{") else {}
                    return self._skill_dict_to_entry(data, skill_dir, "manifest")
                except (json.JSONDecodeError, OSError) as exc:
                    warnings.append(f"Skill manifest {candidate.name} parse error: {exc}")

        # No manifest found, use directory name
        return self._skill_dict_to_entry({}, skill_dir, "directory")

    def _parse_skill_file(self, path: Path, warnings: list[str]) -> dict[str, Any] | None:
        """Parse a skill file (JSON, YAML, or Markdown with frontmatter)."""
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            stripped = content.strip()

            # JSON skill file
            if stripped.startswith("{"):
                try:
                    data = json.loads(content)
                    return self._skill_dict_to_entry(data, path, "file")
                except json.JSONDecodeError as exc:
                    warnings.append(f"Skill file {path.name} JSON parse error: {exc}")
                    return None

            # YAML skill file
            if path.suffix in (".yaml", ".yml"):
                try:
                    data = yaml.safe_load(content)
                    if isinstance(data, dict):
                        return self._skill_dict_to_entry(data, path, "file")
                except yaml.YAMLError as exc:
                    warnings.append(f"Skill file {path.name} YAML parse error: {exc}")
                return None

            # Markdown with YAML frontmatter (SKILL.md pattern)
            if path.suffix == ".md":
                return self._parse_skill_markdown(content, path, warnings)

            return None
        except (OSError, ValueError) as exc:
            warnings.append(f"Skill file {path.name} read error: {exc}")
            return None

    def _parse_skill_markdown(
        self, content: str, path: Path, warnings: list[str]
    ) -> dict[str, Any] | None:
        """Parse a Markdown skill file with optional YAML frontmatter."""
        match = _FRONTMATTER_RE.match(content)
        if not match:
            # No frontmatter — use filename as fallback
            return {
                "id": path.stem,
                "name": path.stem,
                "description": "",
                "version": "",
                "author": "",
                "category": "",
                "enabled": True,
                "path": str(path),
                "source": "markdown",
            }

        raw_yaml = match.group(1)
        try:
            data = yaml.safe_load(raw_yaml)
            if not isinstance(data, dict):
                data = {}
        except yaml.YAMLError as exc:
            warnings.append(f"Skill {path.name} frontmatter parse error: {exc}")
            data = {}

        return {
            "id": data.get("id", path.stem),
            "name": data.get("name", path.stem),
            "description": data.get("description", ""),
            "version": data.get("version", ""),
            "author": data.get("author", ""),
            "category": data.get("category", ""),
            "enabled": data.get("enabled", True),
            "path": str(path),
            "source": "frontmatter",
        }

    @staticmethod
    def _skill_dict_to_entry(data: dict[str, Any], path: Path, source: str) -> dict[str, Any]:
        """Convert a parsed dict to a normalized skill entry."""
        return {
            "id": data.get("id", path.stem),
            "name": data.get("name", path.stem),
            "description": data.get("description", ""),
            "version": data.get("version", ""),
            "author": data.get("author", ""),
            "category": data.get("category", ""),
            "enabled": data.get("enabled", True),
            "path": str(path),
            "source": source,
        }

    @staticmethod
    def _safe_workspace_root(workspace_path: str | None, warnings: list[str]) -> Path | None:
        if not workspace_path:
            return None
        try:
            raw = Path(workspace_path).expanduser()
            if ".." in raw.parts:
                raise ValueError("workspace_path must not contain '..'")
            root = raw.resolve(strict=False)
            if not root.exists():
                warnings.append(f"Workspace path does not exist: {_path_name(str(root))}")
                return root
            if not root.is_dir():
                warnings.append(f"Workspace path is not a directory: {_path_name(str(root))}")
                return root
            return root
        except (OSError, ValueError) as exc:
            warnings.append(f"Workspace path rejected: {exc}")
            return None

    @staticmethod
    def _is_inside_root(path: Path, root: Path) -> bool:
        try:
            path.resolve(strict=False).relative_to(root.resolve(strict=False))
            return True
        except (OSError, ValueError):
            return False
