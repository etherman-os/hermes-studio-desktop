"""Read-only config repository for Hermes configuration files.

Provides safe, read-only access to Hermes model/provider configuration.
Never writes to config.yaml or .env. Redacts all secrets.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped]

logger = logging.getLogger("hermes_adapter.config_repository")

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


def get_hermes_home() -> Path:
    """Locate the Hermes home directory."""
    for var in ("HERMES_STUDIO_HERMES_HOME", "HERMES_HOME"):
        val = os.environ.get(var)
        if val:
            p = Path(val).expanduser()
            if p.exists():
                return p
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
    except Exception:
        pass
    return False


class ConfigRepository:
    """Read-only access to Hermes model/provider configuration."""

    def __init__(self, hermes_home: Path) -> None:
        self._hermes_home = hermes_home
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

        All sensitive values are redacted.
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
            "warnings": list(self._warnings),
        }

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
