"""Theme repository — discover, validate, and manage concept packs.

Read-only access to theme TOML files. Never executes code from theme packs.
Supports inheritance via `extends` field.
"""

from __future__ import annotations

import json
import logging
import os
import re
import tomllib
from pathlib import Path
from typing import Any

logger = logging.getLogger("hermes_adapter.theme_repository")

_SEMANTIC_SLOTS = [
    "profiles", "sessions", "chat", "kanban", "artifacts", "tools",
    "memory", "logs", "activity", "inspector", "command_palette",
    "settings", "theme_gallery",
]

_DEFAULT_THEME_ID = "default-dark"

_STUDIO_CONFIG_DIR = Path.home() / ".config" / "hermes-desktop-studio"
_STUDIO_CONFIG_FILE = _STUDIO_CONFIG_DIR / "config.json"


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Deep merge override into base. Override wins."""
    result = dict(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _validate_theme(data: dict[str, Any], path: Path) -> list[str]:
    """Validate a theme dict. Returns list of warnings (empty = valid)."""
    warnings: list[str] = []

    meta = data.get("meta")
    if not isinstance(meta, dict):
        warnings.append(f"{path.name}: missing [meta] section")
        return warnings

    for field in ("id", "name", "version", "author"):
        if field not in meta:
            warnings.append(f"{path.name}: missing meta.{field}")

    theme_id = meta.get("id", "")
    if theme_id and not re.match(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$", theme_id):
        warnings.append(f"{path.name}: invalid meta.id format: {theme_id}")

    palette = data.get("palette")
    if palette and isinstance(palette, dict):
        for key, value in palette.items():
            if isinstance(value, str) and not value.startswith(("#", "rgb", "hsl", "var(")):
                warnings.append(f"{path.name}: palette.{key} may not be a valid color: {value}")

    return warnings


def _get_builtin_themes_dir() -> Path:
    """Get the built-in themes directory from the repo."""
    # Look for themes/ relative to this file's ancestors
    candidates = [
        Path(__file__).parent.parent.parent.parent / "themes",
        Path(__file__).parent.parent.parent / "themes",
        Path.cwd() / "themes",
        Path("/home/etherman/Projects/hermes_shell/themes"),
    ]
    for p in candidates:
        if p.is_dir():
            return p
    return Path(__file__).parent.parent.parent.parent / "themes"


def _get_user_themes_dir() -> Path:
    """Get the user themes directory."""
    env = os.environ.get("HERMES_STUDIO_THEMES_DIR")
    if env:
        p = Path(env).expanduser()
        if p.is_dir():
            return p

    # Platform-specific default
    return Path.home() / ".config" / "hermes-desktop-studio" / "themes"


class ThemeRepository:
    """Discover, validate, and manage theme packs."""

    def __init__(self) -> None:
        self._themes: dict[str, dict[str, Any]] = {}
        self._raw_themes: dict[str, dict[str, Any]] = {}
        self._warnings: dict[str, list[str]] = {}
        self._active_theme_id: str = _DEFAULT_THEME_ID
        self._load_active_theme_id()
        self._discover_themes()

    def _load_active_theme_id(self) -> None:
        """Load persisted active theme ID from studio config."""
        try:
            if _STUDIO_CONFIG_FILE.is_file():
                with open(_STUDIO_CONFIG_FILE) as f:
                    config = json.load(f)
                    saved = config.get("active_theme")
                    if isinstance(saved, str) and saved:
                        self._active_theme_id = saved
        except (OSError, json.JSONDecodeError) as e:
            logger.debug("Could not load active theme ID from %s: %s", _STUDIO_CONFIG_FILE, e)

    def _save_active_theme_id(self, theme_id: str) -> None:
        """Persist active theme ID to studio config."""
        try:
            _STUDIO_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            config: dict[str, Any] = {}
            if _STUDIO_CONFIG_FILE.is_file():
                with open(_STUDIO_CONFIG_FILE) as f:
                    config = json.load(f)
            config["active_theme"] = theme_id
            with open(_STUDIO_CONFIG_FILE, "w") as f:
                json.dump(config, f, indent=2)
        except Exception as e:
            logger.warning("Failed to save active theme: %s", e)

    def _discover_themes(self) -> None:
        """Discover and load all theme packs."""
        builtin_dir = _get_builtin_themes_dir()
        user_dir = _get_user_themes_dir()

        # Scan both directories
        for search_dir in [builtin_dir, user_dir]:
            if not search_dir.is_dir():
                continue
            for entry in sorted(search_dir.iterdir()):
                if not entry.is_dir():
                    continue
                theme_file = entry / "theme.toml"
                if not theme_file.is_file():
                    continue
                self._load_theme_file(theme_file, source="built-in" if search_dir == builtin_dir else "user")

        # Resolve inheritance
        self._resolve_all_inheritance()

        # Validate active theme exists
        if self._active_theme_id not in self._themes:
            logger.warning("Active theme '%s' not found, falling back to %s", self._active_theme_id, _DEFAULT_THEME_ID)
            self._active_theme_id = _DEFAULT_THEME_ID

    def _load_theme_file(self, path: Path, source: str) -> None:
        """Load a single theme.toml file."""
        try:
            with open(path, "rb") as f:
                data = tomllib.load(f)

            meta = data.get("meta", {})
            theme_id = meta.get("id", path.parent.name)

            # Validate
            warnings = _validate_theme(data, path)
            self._warnings[theme_id] = warnings

            # Store raw data for inheritance resolution
            data["_source"] = source
            data["_path"] = str(path)
            self._raw_themes[theme_id] = data

            if warnings:
                logger.warning("Theme '%s' has warnings: %s", theme_id, warnings)

        except Exception as e:
            logger.warning("Failed to load theme %s: %s", path, e)
            self._warnings[path.parent.name] = [f"Failed to load: {e}"]

    def _resolve_all_inheritance(self) -> None:
        """Resolve inheritance for all loaded themes."""
        for theme_id in self._raw_themes:
            self._themes[theme_id] = self._resolve_theme(theme_id)

    def _resolve_theme(self, theme_id: str, _resolving: set[str] | None = None) -> dict[str, Any]:
        """Resolve a theme with full inheritance chain."""
        if theme_id in self._themes:
            return self._themes[theme_id]

        raw = self._raw_themes.get(theme_id)
        if not raw:
            return {}

        if _resolving is None:
            _resolving = set()

        extends = raw.get("meta", {}).get("extends")
        if extends:
            if extends not in self._raw_themes:
                logger.warning("Theme '%s' extends '%s' which was not found", theme_id, extends)
                self._warnings.setdefault(theme_id, []).append(f"extends '{extends}' not found")
                # Fall back to default-dark if available
                if extends != _DEFAULT_THEME_ID and _DEFAULT_THEME_ID in self._raw_themes:
                    base = self._resolve_theme(_DEFAULT_THEME_ID, _resolving)
                else:
                    base = {}
            else:
                # Prevent circular inheritance
                if extends == theme_id or extends in _resolving:
                    logger.warning("Theme '%s' has circular extends chain involving '%s'", theme_id, extends)
                    self._warnings.setdefault(theme_id, []).append(f"circular extends: '{extends}'")
                    base = {}
                else:
                    _resolving.add(theme_id)
                    base = self._resolve_theme(extends, _resolving)
                    _resolving.discard(theme_id)

            # Deep merge: child overrides base
            resolved = _deep_merge(base, dict(raw))
        else:
            resolved = dict(raw)

        # Remove internal fields
        resolved.pop("_source", None)
        resolved.pop("_path", None)

        return resolved

    def list_themes(self) -> list[dict[str, Any]]:
        """Return list of discovered themes with metadata."""
        result = []
        for theme_id, data in self._themes.items():
            meta = data.get("meta", {})
            result.append({
                "id": theme_id,
                "name": meta.get("name", theme_id),
                "version": meta.get("version", "0.0.0"),
                "author": meta.get("author", "unknown"),
                "description": meta.get("description", ""),
                "extends": meta.get("extends"),
                "source": data.get("_source", self._raw_themes.get(theme_id, {}).get("_source", "unknown")),
                "valid": len(self._warnings.get(theme_id, [])) == 0,
                "warnings": self._warnings.get(theme_id, []),
            })
        return result

    def get_theme(self, theme_id: str) -> dict[str, Any] | None:
        """Return a fully resolved theme by ID."""
        return self._themes.get(theme_id)

    def get_active_theme_id(self) -> str:
        """Return the active theme ID."""
        return self._active_theme_id

    def get_active_theme(self) -> dict[str, Any]:
        """Return the fully resolved active theme."""
        return self._themes.get(self._active_theme_id, self._themes.get(_DEFAULT_THEME_ID, {}))

    def activate_theme(self, theme_id: str) -> dict[str, Any]:
        """Activate a theme by ID. Persists to studio config."""
        if theme_id not in self._themes:
            raise ValueError(f"Theme '{theme_id}' not found")
        warnings = self._warnings.get(theme_id, [])
        if warnings:
            logger.warning("Activating theme '%s' with warnings: %s", theme_id, warnings)
        self._active_theme_id = theme_id
        self._save_active_theme_id(theme_id)
        return self.get_theme_info(theme_id)

    def get_theme_info(self, theme_id: str) -> dict[str, Any]:
        """Return theme info for API response."""
        data = self._themes.get(theme_id)
        if not data:
            raise ValueError(f"Theme '{theme_id}' not found")
        meta = data.get("meta", {})
        return {
            "id": theme_id,
            "name": meta.get("name", theme_id),
            "version": meta.get("version", "0.0.0"),
            "author": meta.get("author", "unknown"),
            "description": meta.get("description", ""),
            "extends": meta.get("extends"),
            "source": self._raw_themes.get(theme_id, {}).get("_source", "unknown"),
            "valid": len(self._warnings.get(theme_id, [])) == 0,
            "warnings": self._warnings.get(theme_id, []),
        }

    def get_normalized_theme(self, theme_id: str) -> dict[str, Any]:
        """Return theme data normalized for frontend consumption.

        Returns palette, icons, labels, borders, typography, etc.
        """
        data = self._themes.get(theme_id)
        if not data:
            raise ValueError(f"Theme '{theme_id}' not found")

        meta = data.get("meta", {})
        return {
            "meta": {
                "id": theme_id,
                "name": meta.get("name", theme_id),
                "version": meta.get("version", "0.0.0"),
                "author": meta.get("author", "unknown"),
                "description": meta.get("description", ""),
                "extends": meta.get("extends"),
            },
            "palette": data.get("palette", {}),
            "typography": data.get("typography", {}),
            "borders": data.get("borders", {}),
            "icons": data.get("icons", {}),
            "labels": data.get("labels", {}),
            "empty_states": data.get("empty_states", {}),
            "onboarding": data.get("onboarding", {}),
            "kanban": data.get("kanban", {}),
            "message_styles": data.get("message_styles", {}),
            "accessibility": data.get("accessibility", {}),
            "assets": data.get("assets", {}),
            "layout_defaults": data.get("layout_defaults", {}),
        }

    def reload(self) -> None:
        """Rescan theme directories and reload all themes."""
        self._themes.clear()
        self._raw_themes.clear()
        self._warnings.clear()
        self._discover_themes()
