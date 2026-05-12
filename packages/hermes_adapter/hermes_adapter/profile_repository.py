"""Read-only profile repository for Hermes profile discovery.

Provides safe, read-only access to Hermes profile metadata.
Never creates, deletes, or modifies profiles.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger("hermes_adapter.profile_repository")


def get_hermes_home() -> Path:
    """Locate the Hermes home directory."""
    for var in ("HERMES_STUDIO_HERMES_HOME", "HERMES_HOME"):
        val = os.environ.get(var)
        if val:
            return Path(val).expanduser()
    return Path.home() / ".hermes"


class ProfileRepository:
    """Read-only access to Hermes profile metadata."""

    def __init__(self, hermes_home: Path) -> None:
        self._hermes_home = hermes_home
        self._profiles: list[dict[str, Any]] = []
        self._active_profile: str | None = None
        self._available = False
        self._unavailable_reason: str | None = None
        self._discover_profiles()

    def _discover_profiles(self) -> None:
        """Discover available Hermes profiles."""
        try:
            # Check for profiles directory
            profiles_dir = self._hermes_home / "profiles"
            if profiles_dir.is_dir():
                for entry in sorted(profiles_dir.iterdir()):
                    if entry.is_dir():
                        profile = self._inspect_profile(entry)
                        if profile:
                            self._profiles.append(profile)

            # If no profiles directory, check if hermes_home itself is a profile
            if not self._profiles:
                profile = self._inspect_profile(self._hermes_home)
                if profile:
                    self._profiles.append(profile)

            # Try to detect active profile
            self._active_profile = self._detect_active_profile()

            if self._profiles:
                self._available = True
            else:
                self._unavailable_reason = "No profiles found"
                # Still mark as available with default
                self._available = True
                self._profiles = [{"id": "default", "name": "default", "path": str(self._hermes_home), "active": True, "has_config": False, "has_state_db": False}]

        except Exception as e:
            self._unavailable_reason = f"Error discovering profiles: {e}"
            logger.warning("Failed to discover profiles: %s", e)

    def _inspect_profile(self, profile_dir: Path) -> dict[str, Any] | None:
        """Inspect a profile directory and return metadata."""
        try:
            name = profile_dir.name
            has_config = (profile_dir / "config.yaml").is_file() or (profile_dir / "config.yml").is_file()
            has_state_db = (profile_dir / "state.db").is_file()

            session_count = 0
            if has_state_db:
                try:
                    import sqlite3
                    conn = sqlite3.connect(f"file:{profile_dir / 'state.db'}?mode=ro", uri=True)
                    cursor = conn.cursor()
                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
                    if cursor.fetchone():
                        cursor.execute("SELECT COUNT(*) FROM sessions")
                        session_count = cursor.fetchone()[0]
                    conn.close()
                except sqlite3.Error as e:
                    logger.debug("Could not read session count from %s: %s", profile_dir, e)

            return {
                "id": name,
                "name": name,
                "path": name,  # Don't expose full path
                "active": False,
                "has_config": has_config,
                "has_state_db": has_state_db,
                "session_count": session_count,
            }
        except Exception:
            return None

    def _detect_active_profile(self) -> str | None:
        """Try to detect the active profile from config."""
        try:
            config_path = self._hermes_home / "config.yaml"
            if not config_path.is_file():
                config_path = self._hermes_home / "config.yml"
            if config_path.is_file():
                with open(config_path) as f:
                    config = yaml.safe_load(f) or {}
                    profile = config.get("profile") or config.get("active_profile")
                    if isinstance(profile, str):
                        return profile
        except (OSError, yaml.YAMLError) as e:
            logger.debug("Could not detect active profile from config: %s", e)

        # Check env var
        return os.environ.get("HERMES_PROFILE") or None

    @property
    def available(self) -> bool:
        return self._available

    @property
    def active_profile(self) -> str | None:
        return self._active_profile

    @property
    def profile_count(self) -> int:
        return len(self._profiles)

    def get_status(self) -> dict[str, Any]:
        """Return profile repository status for health/bootstrap."""
        return {
            "available": self._available,
            "profile_count": self.profile_count,
            "active_profile": self._active_profile,
            "unavailable_reason": self._unavailable_reason,
        }

    def list_profiles(self) -> list[dict[str, Any]]:
        """Return list of discovered profiles."""
        result = []
        for p in self._profiles:
            entry = dict(p)
            if self._active_profile and entry["id"] == self._active_profile:
                entry["active"] = True
            result.append(entry)
        return result

    def get_active_profile(self) -> dict[str, Any] | None:
        """Return the active profile metadata."""
        if self._active_profile:
            for p in self._profiles:
                if p["id"] == self._active_profile:
                    entry = dict(p)
                    entry["active"] = True
                    return entry
        # Default to first profile
        if self._profiles:
            entry = dict(self._profiles[0])
            entry["active"] = True
            return entry
        return None
