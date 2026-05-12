"""TOML theme/layout loader with Pydantic wrappers over theme_loader."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from hermes_adapter.models import ThemeInfo
from hermes_adapter.theme_loader import ThemeManager as _BaseThemeManager

_DEFAULT_THEMES_DIR = Path("/home/etherman/Projects/hermes_shell/themes")


class ThemeManager:
    """Manages discovery, loading, and activation of themes."""

    def __init__(self, themes_dir: Path | None = None) -> None:
        """Initialize with the given themes directory."""
        self._base = _BaseThemeManager(themes_dir or _DEFAULT_THEMES_DIR)
        self._active_theme_id: str | None = None

    @property
    def themes_dir(self) -> Path:
        """Return the configured theme directory."""
        return self._base.themes_dir

    def list_themes(self) -> list[ThemeInfo]:
        """List all available themes in the themes directory."""
        raw_themes = self._base.list_themes()
        return [
            ThemeInfo(
                id=t["id"],
                name=t["name"],
                version=t["version"],
                author=t["author"],
                description=t["description"],
            )
            for t in raw_themes
        ]

    def load_theme(self, theme_id: str) -> dict[str, Any]:
        """Load a theme by ID, resolving inheritance if needed."""
        return self._base.load_theme(theme_id)

    def get_active_theme(self) -> ThemeInfo | None:
        """Return the currently active theme metadata, or None."""
        if self._active_theme_id is None:
            return None
        data = self._base.load_theme(self._active_theme_id)
        meta = data.get("meta", {})
        return ThemeInfo(
            id=meta.get("id", self._active_theme_id),
            name=meta.get("name", self._active_theme_id),
            version=meta.get("version", ""),
            author=meta.get("author", ""),
            description=meta.get("description", ""),
        )

    def set_active_theme(self, theme_id: str) -> ThemeInfo:
        """Set the active theme by ID and return its metadata."""
        # Validate theme exists
        self._base.load_theme(theme_id)
        self._active_theme_id = theme_id
        theme_info = self.get_active_theme()
        if theme_info is None:
            raise ValueError("Failed to load theme info")
        return theme_info
