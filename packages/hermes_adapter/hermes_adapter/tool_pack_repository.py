"""Tool Pack Repository — discover, validate, and manage local tool packs.

Scans ~/.hermes-local-shell/tool-packs/ for manifest.json files.
Validates against the toolPack.schema.json schema.
Stores enabled/disabled state in studio.db.
"""

from __future__ import annotations

import json
import logging
import platform
import re
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from hermes_adapter.studio_storage import StudioStorage

logger = logging.getLogger("hermes_adapter.tool_pack_repository")

_DEFAULT_PACKS_DIR = Path.home() / ".hermes-local-shell" / "tool-packs"

_VALID_COMMAND_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")
_VALID_PLATFORMS = {"linux", "macos", "windows"}
_PLATFORM_MAP = {
    "Linux": "linux",
    "Darwin": "macos",
    "Windows": "windows",
}

_REQUIRED_PERMISSIONS: dict[str, set[str]] = {
    "ls": {"filesystem:read"},
    "cat": {"filesystem:read"},
    "find": {"filesystem:read"},
    "git": {"filesystem:read"},
    "curl": {"network:https"},
    "wget": {"network:https"},
    "ps": {"process:spawn"},
}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _current_platform() -> str:
    return _PLATFORM_MAP.get(platform.system(), "linux")


def _validate_manifest(data: dict[str, Any], path: Path) -> list[str]:
    """Validate a tool pack manifest. Returns list of warnings (empty = valid)."""
    warnings: list[str] = []

    for field in ("id", "name", "version", "author", "commands"):
        if field not in data:
            warnings.append(f"{path}: missing required field '{field}'")

    pack_id = data.get("id", "")
    if pack_id and not _VALID_COMMAND_ID_RE.match(pack_id):
        warnings.append(f"{path}: invalid id format: {pack_id}")

    version = data.get("version", "")
    if version and not re.match(r"^[0-9]+\.[0-9]+\.[0-9]+$", version):
        warnings.append(f"{path}: invalid version format: {version}")

    commands = data.get("commands", [])
    if not isinstance(commands, list) or len(commands) == 0:
        warnings.append(f"{path}: commands must be a non-empty array")
    else:
        seen_ids: set[str] = set()
        for idx, cmd in enumerate(commands):
            if not isinstance(cmd, dict):
                warnings.append(f"{path}: commands[{idx}] is not an object")
                continue
            cmd_id = cmd.get("id", "")
            if not cmd_id:
                warnings.append(f"{path}: commands[{idx}] missing 'id'")
            elif cmd_id in seen_ids:
                warnings.append(f"{path}: duplicate command id: {cmd_id}")
            else:
                seen_ids.add(cmd_id)
            if not cmd.get("name"):
                warnings.append(f"{path}: commands[{idx}] missing 'name'")
            if not cmd.get("command"):
                warnings.append(f"{path}: commands[{idx}] missing 'command'")

    compat = data.get("compat", {})
    if isinstance(compat, dict):
        platform_list = compat.get("platform")
        if isinstance(platform_list, list):
            for p in platform_list:
                if p not in _VALID_PLATFORMS:
                    warnings.append(f"{path}: invalid platform: {p}")

    permissions = data.get("permissions", [])
    if isinstance(permissions, list):
        for perm in permissions:
            if not isinstance(perm, str) or ":" not in perm:
                warnings.append(f"{path}: invalid permission format: {perm}")

    return warnings


class ToolPackRepository:
    """Discover, validate, and manage local tool packs."""

    def __init__(self, packs_dir: Path | None = None, storage: StudioStorage | None = None) -> None:
        self._packs_dir = packs_dir or _DEFAULT_PACKS_DIR
        self._storage = storage or StudioStorage()
        self._discovered: dict[str, dict[str, Any]] = {}
        self._warnings: dict[str, list[str]] = {}
        self._discover()

    def _discover(self) -> None:
        """Scan packs directory for manifest.json files."""
        if not self._packs_dir.is_dir():
            logger.info("Tool packs directory does not exist: %s", self._packs_dir)
            return

        for entry in sorted(self._packs_dir.iterdir()):
            if not entry.is_dir():
                continue
            manifest_path = entry / "manifest.json"
            if not manifest_path.is_file():
                continue
            self._load_manifest(manifest_path)

    def _load_manifest(self, path: Path) -> None:
        """Load and validate a single manifest.json."""
        try:
            with open(path) as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to load tool pack manifest %s: %s", path, e)
            self._warnings[path.parent.name] = [f"Failed to load: {e}"]
            return

        pack_id = data.get("id", path.parent.name)
        warnings = _validate_manifest(data, path)
        self._warnings[pack_id] = warnings

        if warnings:
            logger.warning("Tool pack '%s' has warnings: %s", pack_id, warnings)

        data["_source_path"] = str(path)
        self._discovered[pack_id] = data

    def _is_compatible(self, pack: dict[str, Any]) -> bool:
        """Check if a pack is compatible with the current platform."""
        compat = pack.get("compat", {})
        if not isinstance(compat, dict):
            return True
        platforms = compat.get("platform")
        if not isinstance(platforms, list) or not platforms:
            return True
        return _current_platform() in platforms

    def _sync_to_db(self) -> None:
        """Sync discovered packs to the database, preserving enabled state."""
        try:
            with self._storage.connect() as conn:
                existing = {
                    row["id"]: dict(row)
                    for row in conn.execute("SELECT id, enabled, trusted FROM tool_packs").fetchall()
                }
                now = _now_iso()

                for pack_id, pack in self._discovered.items():
                    is_valid = len(self._warnings.get(pack_id, [])) == 0
                    if not is_valid:
                        continue

                    if pack_id in existing:
                        conn.execute(
                            "UPDATE tool_packs SET name=?, version=?, author=?, description=?, manifest_json=?, source_path=?, trusted=?, updated_at=? WHERE id=?",
                            (
                                pack.get("name", pack_id),
                                pack.get("version", "0.0.0"),
                                pack.get("author", "unknown"),
                                pack.get("description", ""),
                                json.dumps(pack),
                                pack.get("_source_path", ""),
                                1 if pack.get("trusted", False) else 0,
                                now,
                                pack_id,
                            ),
                        )
                    else:
                        conn.execute(
                            "INSERT INTO tool_packs (id, name, version, author, description, manifest_json, source_path, enabled, trusted, installed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
                            (
                                pack_id,
                                pack.get("name", pack_id),
                                pack.get("version", "0.0.0"),
                                pack.get("author", "unknown"),
                                pack.get("description", ""),
                                json.dumps(pack),
                                pack.get("_source_path", ""),
                                1 if pack.get("trusted", False) else 0,
                                now,
                                now,
                            ),
                        )

                # Remove packs that no longer exist on disk
                for existing_id in existing:
                    if existing_id not in self._discovered:
                        conn.execute("DELETE FROM tool_packs WHERE id = ?", (existing_id,))

        except Exception as e:
            logger.warning("Failed to sync tool packs to DB: %s", e)

    def list_packs(self) -> list[dict[str, Any]]:
        """Return all discovered packs with their status."""
        self._sync_to_db()

        result: list[dict[str, Any]] = []
        try:
            with self._storage.connect() as conn:
                rows = conn.execute(
                    "SELECT id, name, version, author, description, manifest_json, enabled, trusted, installed_at, updated_at FROM tool_packs ORDER BY name"
                ).fetchall()
                db_packs = {row["id"]: dict(row) for row in rows}
        except Exception:
            db_packs = {}

        for pack_id, pack in self._discovered.items():
            is_valid = len(self._warnings.get(pack_id, [])) == 0
            db_info = db_packs.get(pack_id, {})

            result.append({
                "id": pack_id,
                "name": pack.get("name", pack_id),
                "version": pack.get("version", "0.0.0"),
                "author": pack.get("author", "unknown"),
                "description": pack.get("description", ""),
                "commands": [
                    {
                        "id": cmd.get("id", ""),
                        "name": cmd.get("name", ""),
                        "description": cmd.get("description", ""),
                        "command": cmd.get("command", ""),
                        "args": cmd.get("args", []),
                        "env": cmd.get("env", {}),
                    }
                    for cmd in pack.get("commands", [])
                ],
                "trusted": bool(pack.get("trusted", False)),
                "permissions": pack.get("permissions", []),
                "compat": pack.get("compat", {}),
                "enabled": bool(db_info.get("enabled", 0)),
                "valid": is_valid,
                "warnings": self._warnings.get(pack_id, []),
                "compatible": self._is_compatible(pack),
                "installed_at": db_info.get("installed_at"),
                "updated_at": db_info.get("updated_at"),
            })

        return result

    def get_pack(self, pack_id: str) -> dict[str, Any]:
        """Return a single pack by ID."""
        packs = self.list_packs()
        for pack in packs:
            if pack["id"] == pack_id:
                return pack
        raise ValueError(f"Tool pack '{pack_id}' not found")

    def enable_pack(self, pack_id: str) -> dict[str, Any]:
        """Enable a tool pack."""
        if pack_id not in self._discovered:
            raise ValueError(f"Tool pack '{pack_id}' not found")

        pack = self._discovered[pack_id]
        is_valid = len(self._warnings.get(pack_id, [])) == 0
        if not is_valid:
            raise ValueError(f"Cannot enable invalid tool pack '{pack_id}': {self._warnings[pack_id]}")

        if not self._is_compatible(pack):
            raise ValueError(f"Tool pack '{pack_id}' is not compatible with the current platform")

        # Ensure pack exists in DB
        self._sync_to_db()

        try:
            with self._storage.connect() as conn:
                conn.execute(
                    "UPDATE tool_packs SET enabled = 1, updated_at = ? WHERE id = ?",
                    (_now_iso(), pack_id),
                )
        except Exception as e:
            raise RuntimeError(f"Failed to enable tool pack: {e}") from e

        return self.get_pack(pack_id)

    def disable_pack(self, pack_id: str) -> dict[str, Any]:
        """Disable a tool pack."""
        if pack_id not in self._discovered:
            raise ValueError(f"Tool pack '{pack_id}' not found")

        # Ensure pack exists in DB
        self._sync_to_db()

        try:
            with self._storage.connect() as conn:
                conn.execute(
                    "UPDATE tool_packs SET enabled = 0, updated_at = ? WHERE id = ?",
                    (_now_iso(), pack_id),
                )
        except Exception as e:
            raise RuntimeError(f"Failed to disable tool pack: {e}") from e

        return self.get_pack(pack_id)

    def install_pack(self, source_path: str) -> dict[str, Any]:
        """Install a tool pack from a local path."""
        manifest_path = Path(source_path).expanduser()
        if manifest_path.is_dir():
            manifest_path = manifest_path / "manifest.json"
        if not manifest_path.is_file():
            raise ValueError(f"Manifest not found: {manifest_path}")

        try:
            with open(manifest_path) as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            raise ValueError(f"Failed to read manifest: {e}") from e

        warnings = _validate_manifest(data, manifest_path)
        if warnings:
            raise ValueError(f"Invalid manifest: {'; '.join(warnings)}")

        pack_id = data["id"]

        # Copy to packs directory
        dest_dir = self._packs_dir / pack_id
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_manifest = dest_dir / "manifest.json"
        import shutil
        shutil.copy2(manifest_path, dest_manifest)

        # Reload
        self._discovered.clear()
        self._warnings.clear()
        self._discover()

        # Enable by default if trusted
        if data.get("trusted", False):
            with suppress(Exception):
                self.enable_pack(pack_id)

        return self.get_pack(pack_id)

    def reload(self) -> None:
        """Rescan packs directory."""
        self._discovered.clear()
        self._warnings.clear()
        self._discover()
