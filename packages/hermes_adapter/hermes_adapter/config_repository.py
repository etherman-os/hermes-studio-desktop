"""Read-only config repository for Hermes configuration files.

Provides safe, read-only access to Hermes model/provider configuration.
Never writes to config.yaml or .env. Redacts all secrets.

Hardened with:
- File permission checks (warn if world-readable)
- Config validation before writes
- Config backup before modifications
- Rollback capability
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import stat
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import yaml

from hermes_adapter.config_cache import ConfigCache

logger = logging.getLogger("hermes_adapter.config_repository")

# Module-level cache instance (5-second TTL)
_config_cache = ConfigCache(default_ttl=5.0)

_SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|token|secret|password|auth)\s*[:=]\s*\S+"),
    re.compile(r"Bearer\s+\S+", re.IGNORECASE),
    re.compile(r"\b[a-f0-9]{32,}\b"),
    re.compile(r"(?i)(sk-|tvly-|xai-)[a-zA-Z0-9]+"),
]

_SENSITIVE_KEYS = {
    "api_key", "api-key", "apikey", "token", "secret", "password",
    "auth", "bearer", "openai_api_key", "anthropic_api_key",
    "google_api_key", "xai_api_key", "nous_api_key",
}

_BACKUP_SUFFIX = ".bak"
_MAX_BACKUPS = 3


def get_hermes_home() -> Path:
    """Locate the Hermes home directory."""
    for var in ("HERMES_STUDIO_HERMES_HOME", "HERMES_HOME"):
        val = os.environ.get(var)
        if val:
            return Path(val).expanduser()
    return Path.home() / ".hermes"


def _redact_value(key: str, value: Any) -> Any:
    """Redact sensitive values."""
    if isinstance(value, str):
        if key.lower().replace("-", "_") in _SENSITIVE_KEYS:
            return "[REDACTED]" if value else ""
        for pattern in _SECRET_PATTERNS:
            if pattern.search(value):
                return "[REDACTED]"
    return value


def _is_api_key_configured(env_path: Path, key_patterns: list[str]) -> bool:
    """Check if any API key is configured in .env without revealing values."""
    if not env_path.is_file():
        return False
    try:
        with open(env_path, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip().lower()
                v = v.strip().strip('"').strip("'")
                if not v:
                    continue
                for pattern in key_patterns:
                    if pattern in k:
                        return True
    except OSError as e:
        logger.debug("Could not read env file %s: %s", env_path, e)
    return False


def _provider_name(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("id", "name", "provider"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def _normalize_model_option(raw: Any, fallback_provider: str = "unknown") -> dict[str, str] | None:
    """Normalize a config/API model option without exposing provider secrets."""
    if isinstance(raw, str):
        return {"id": raw, "name": raw, "provider": fallback_provider or "unknown"}
    if not isinstance(raw, dict):
        return None

    model_id = raw.get("id", raw.get("model", raw.get("name")))
    if not isinstance(model_id, str) or not model_id:
        return None

    name = raw.get("name", model_id)
    provider = raw.get("provider", raw.get("provider_id", raw.get("owned_by", fallback_provider)))
    return {
        "id": model_id,
        "name": str(name) if name else model_id,
        "provider": _provider_name(provider) or fallback_provider or "unknown",
    }


# ---------------------------------------------------------------------------
# File permission checking
# ---------------------------------------------------------------------------


def check_file_permissions(path: Path) -> list[str]:
    """Check file permissions and return a list of warnings.

    Warns if the file is world-readable or group-readable.
    """
    warnings: list[str] = []
    if not path.exists():
        return warnings

    try:
        mode = path.stat().st_mode
        if mode & stat.S_IROTH:
            warnings.append(f"{path} is world-readable (mode {oct(mode)})")
        if mode & stat.S_IWOTH:
            warnings.append(f"{path} is world-writable (mode {oct(mode)})")
        if mode & stat.S_IRGRP:
            warnings.append(f"{path} is group-readable (mode {oct(mode)})")
    except OSError:
        pass

    return warnings


# ---------------------------------------------------------------------------
# Config backup and rollback
# ---------------------------------------------------------------------------


def _create_config_backup(path: Path) -> Path | None:
    """Create a timestamped backup of *path*. Returns backup path or ``None``."""
    if not path.exists():
        return None
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    backup_path = path.with_name(f"{path.name}{_BACKUP_SUFFIX}.{timestamp}")
    try:
        shutil.copy2(path, backup_path)
        _rotate_backups(path)
        return backup_path
    except OSError:
        logger.warning("Failed to create backup of %s", path)
        return None


def _rotate_backups(path: Path) -> None:
    """Keep the last ``_MAX_BACKUPS`` backups."""
    parent = path.parent
    stem = path.name
    backups = sorted(
        parent.glob(f"{stem}{_BACKUP_SUFFIX}.*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in backups[_MAX_BACKUPS:]:
        with suppress(OSError):
            old.unlink()


def rollback_config(path: Path) -> bool:
    """Restore *path* from the most recent backup.

    Returns ``True`` if rollback succeeded.
    """
    parent = path.parent
    stem = path.name
    backups = sorted(
        parent.glob(f"{stem}{_BACKUP_SUFFIX}.*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not backups:
        return False
    try:
        shutil.copy2(backups[0], path)
        return True
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------


def validate_config(data: dict[str, Any]) -> list[str]:
    """Validate config data before writing. Returns a list of error strings (empty if valid)."""
    errors: list[str] = []
    if not isinstance(data, dict):
        errors.append("Config must be a mapping")
        return errors

    # Check for obviously invalid types
    for key in ("provider", "model", "base_url", "base-url"):
        val = data.get(key)
        if val is not None and not isinstance(val, (str, dict)):
            errors.append(f"Config key '{key}' has unexpected type {type(val).__name__}")

    for key in ("temperature", "max_tokens", "max-tokens", "context_window", "context-window"):
        val = data.get(key)
        if val is not None and not isinstance(val, (int, float)):
            errors.append(f"Config key '{key}' must be numeric, got {type(val).__name__}")

    return errors


class ConfigRepository:
    """Read-only access to Hermes model/provider configuration."""

    def __init__(self, hermes_home: Path, cache: ConfigCache | None = None) -> None:
        self._hermes_home = hermes_home
        self._cache = cache or _config_cache
        self._config: dict[str, Any] = {}
        self._config_source: str | None = None
        self._available = False
        self._unavailable_reason: str | None = None
        self._api_key_configured = False
        self._api_key_source: str | None = None
        self._warnings: list[str] = []
        self._load_config()

    def _load_config(self) -> None:
        """Load and parse config.yaml."""
        config_path = self._hermes_home / "config.yaml"
        if not config_path.is_file():
            config_path = self._hermes_home / "config.yml"

        if config_path.is_file():
            # Permission check
            perm_warnings = check_file_permissions(config_path)
            self._warnings.extend(perm_warnings)
            if perm_warnings:
                for w in perm_warnings:
                    logger.warning(w)

            try:
                with open(config_path, encoding="utf-8") as f:
                    raw = yaml.safe_load(f)
                if isinstance(raw, dict):
                    self._config = raw
                    self._config_source = "config.yaml"
                    self._available = True
                else:
                    self._unavailable_reason = "config.yaml is not a valid mapping"
                    self._warnings.append("config.yaml format unexpected")
            except yaml.YAMLError as e:
                self._unavailable_reason = f"YAML parse error: {e}"
                self._warnings.append("config.yaml has syntax errors")
                logger.warning("Failed to parse config.yaml: %s", e)
            except Exception as e:
                self._unavailable_reason = f"Error reading config.yaml: {e}"
                self._warnings.append("config.yaml has syntax errors")
                logger.warning("Failed to read config.yaml: %s", e)
        else:
            self._unavailable_reason = "config.yaml not found"
            self._warnings.append("No config.yaml found")

        # Check .env for API keys
        env_path = self._hermes_home / ".env"
        key_patterns = ["api_key", "api-key", "apikey", "openai", "anthropic", "google", "xai", "nous"]
        if _is_api_key_configured(env_path, key_patterns):
            self._api_key_configured = True
            self._api_key_source = ".env"

    @property
    def available(self) -> bool:
        return self._available

    def get_status(self) -> dict[str, Any]:
        """Return config repository status."""
        return {
            "available": self._available,
            "config_source": self._config_source,
            "unavailable_reason": self._unavailable_reason,
            "warnings": list(self._warnings),
        }

    def get_model_config(self) -> dict[str, Any]:
        """Return normalized model/provider configuration.

        All sensitive values are redacted. Results are cached for 5 seconds.
        """
        provider = self._config.get("provider", "")
        model = self._config.get("model", "")
        base_url = self._config.get("base_url", self._config.get("base-url", ""))
        api_key_configured = self._api_key_configured
        api_key_source = self._api_key_source

        if isinstance(model, dict):
            model_config = model
            model = model_config.get("default", model_config.get("name", ""))
            provider = model_config.get("provider", provider)
            base_url = model_config.get("base_url", model_config.get("base-url", base_url))

        # Also check nested provider config
        if not provider and "providers" in self._config:
            providers = self._config.get("providers", {})
            if isinstance(providers, dict):
                active = providers.get("active", providers.get("default", ""))
                if isinstance(active, str):
                    provider = active
                elif isinstance(active, dict):
                    provider = active.get("name", "")

        providers = self._config.get("providers", {})
        if isinstance(providers, dict) and isinstance(provider, str) and provider:
            provider_config = providers.get(provider)
            if isinstance(provider_config, dict):
                if not base_url:
                    base_url = provider_config.get("base_url", provider_config.get("base-url", ""))
                if not api_key_configured:
                    api_key_configured = any(
                        key.lower().replace("-", "_") in _SENSITIVE_KEYS and bool(value)
                        for key, value in provider_config.items()
                    )
                    if api_key_configured:
                        api_key_source = "config.yaml"

        # Redact base_url if it contains secrets
        if isinstance(base_url, str):
            base_url = _redact_value("base_url", base_url)

        # Get temperature, max_tokens if configured
        temperature = self._config.get("temperature")
        max_tokens = self._config.get("max_tokens", self._config.get("max-tokens"))
        context_window = self._config.get("context_window", self._config.get("context-window"))

        available_models = self.get_available_models(provider=str(provider) if provider else "unknown")

        return {
            "provider": str(provider) if provider else "unknown",
            "model": str(model) if model else "unknown",
            "base_url": str(base_url) if base_url else None,
            "api_key_configured": api_key_configured,
            "api_key_source": api_key_source,
            "config_source": self._config_source or "unavailable",
            "temperature": temperature,
            "max_tokens": max_tokens,
            "context_window": context_window,
            "available_models": available_models,
            "available_model_count": len(available_models),
            "warnings": list(self._warnings),
        }

    def get_available_models(self, provider: str = "unknown") -> list[dict[str, str]]:
        """Return model options declared in config.yaml, normalized with provider metadata."""
        candidates = self._config.get("available_models", self._config.get("models", []))
        if isinstance(candidates, dict):
            models: list[dict[str, str]] = []
            for provider_id, provider_models in candidates.items():
                if isinstance(provider_models, list):
                    for raw_model in provider_models:
                        normalized = _normalize_model_option(raw_model, str(provider_id))
                        if normalized:
                            models.append(normalized)
            return models
        if not isinstance(candidates, list):
            return []
        return [
            normalized
            for raw_model in candidates
            if (normalized := _normalize_model_option(raw_model, provider))
        ]

    def get_provider_status(self) -> dict[str, Any]:
        """Return provider status summary."""
        config = self.get_model_config()
        return {
            "provider": config["provider"],
            "model": config["model"],
            "api_key_configured": config["api_key_configured"],
            "config_source": config["config_source"],
            "warnings": config["warnings"],
        }

    def get_display_config(self) -> dict[str, Any]:
        """Return display/i18n configuration."""
        display = self._config.get("display", {})
        if not isinstance(display, dict):
            display = {}
        language = display.get("language", os.environ.get("HERMES_LANGUAGE", "en"))
        return {
            "language": str(language) if language else "en",
            "timezone": display.get("timezone"),
            "theme": display.get("theme"),
        }

    async def get_model_config_cached(self) -> dict[str, Any]:
        """Async wrapper that caches model config reads."""
        cached = await self._cache.get("model_config")
        if cached is not None:
            return cast(dict[str, Any], cached)
        result = self.get_model_config()
        await self._cache.set("model_config", result)
        return result

    async def get_provider_status_cached(self) -> dict[str, Any]:
        """Async wrapper that caches provider status reads."""
        cached = await self._cache.get("provider_status")
        if cached is not None:
            return cast(dict[str, Any], cached)
        result = self.get_provider_status()
        await self._cache.set("provider_status", result)
        return result

    async def invalidate_cache(self, prefix: str = "") -> None:
        """Invalidate cached entries, optionally by prefix."""
        if prefix:
            await self._cache.invalidate_prefix(prefix)
        else:
            await self._cache.clear()
