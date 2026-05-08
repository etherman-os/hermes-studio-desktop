"""Read-only local Hermes inventory discovery.

This module intentionally reads local Hermes files instead of calling remote
services. Studio and Hermes run on the same workstation, so the adapter can
surface provider/model catalogs, installed skills, MCP servers, and toolsets
without mutating Hermes-owned state.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped]

from hermes_adapter.session_repository import get_hermes_home

logger = logging.getLogger("hermes_adapter.hermes_inventory_repository")

_SENSITIVE_KEY_RE = re.compile(r"api[_-]?key|token|secret|password|auth", re.IGNORECASE)
_SECRET_VALUE_RE = re.compile(
    r"Bearer\s+\S+|(?i:sk-|ghp_|xai-|tvly-)[a-zA-Z0-9_\-]+|\b[a-f0-9]{32,}\b"
)


def _nowarnings(path: Path, error: Exception) -> str:
    return f"{path.name}: {type(error).__name__}: {error}"


def _redact_string(value: str) -> str:
    if _SECRET_VALUE_RE.search(value):
        return "[REDACTED]"
    return value


def _redact_nested(value: Any, key: str = "") -> Any:
    if _SENSITIVE_KEY_RE.search(key):
        if value in (None, ""):
            return value
        return "[REDACTED]"
    if isinstance(value, str):
        return _redact_string(value)
    if isinstance(value, list):
        return [_redact_nested(item, key) for item in value]
    if isinstance(value, dict):
        return {str(k): _redact_nested(v, str(k)) for k, v in value.items()}
    return value


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _safe_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read Hermes inventory JSON %s: %s", path, exc)
        return {}
    return data if isinstance(data, dict) else {}


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (yaml.YAMLError, OSError) as exc:
        logger.warning("Failed to read Hermes config %s: %s", path, exc)
        return {}
    return data if isinstance(data, dict) else {}


def _env_keys_from_dotenv(path: Path) -> set[str]:
    keys: set[str] = set()
    if not path.is_file():
        return keys
    try:
        with path.open(encoding="utf-8", errors="replace") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                if value.strip().strip('"').strip("'"):
                    keys.add(key.strip())
    except OSError as exc:
        logger.warning("Failed to inspect Hermes .env keys: %s", exc)
    return keys


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, (str, int, float))]


def _title_from_markdown(text: str, fallback: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip() or fallback
    return fallback


def _parse_frontmatter(text: str) -> dict[str, Any]:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    frontmatter = text[3:end]
    try:
        data = yaml.safe_load(frontmatter)
    except yaml.YAMLError:
        return {}
    return data if isinstance(data, dict) else {}


class HermesInventoryRepository:
    """Discover local Hermes capabilities without modifying Hermes files."""

    def __init__(self, hermes_home: Path | None = None) -> None:
        self._hermes_home = hermes_home or get_hermes_home()
        self._config = self._load_config()
        self._model_catalog = _read_json(self._hermes_home / "models_dev_cache.json")
        self._ollama_cloud = _read_json(self._hermes_home / "ollama_cloud_models_cache.json")
        self._dotenv_keys = _env_keys_from_dotenv(self._hermes_home / ".env")

    @property
    def hermes_home(self) -> Path:
        return self._hermes_home

    def _load_config(self) -> dict[str, Any]:
        config = _read_yaml(self._hermes_home / "config.yaml")
        if config:
            return config
        return _read_yaml(self._hermes_home / "config.yml")

    def _active_provider_model(self) -> tuple[str | None, str | None]:
        provider = self._config.get("provider")
        model = self._config.get("model")
        if isinstance(model, dict):
            provider = model.get("provider", provider)
            model = model.get("default", model.get("name"))
        return (
            provider if isinstance(provider, str) and provider else None,
            model if isinstance(model, str) and model else None,
        )

    def _configured_provider_ids(self) -> set[str]:
        configured: set[str] = set()
        providers = self._config.get("providers")
        if isinstance(providers, dict):
            configured.update(str(key) for key in providers if key not in {"active", "default"})
            for key in ("active", "default"):
                value = providers.get(key)
                if isinstance(value, str) and value:
                    configured.add(value)
                elif isinstance(value, dict):
                    name = value.get("name") or value.get("id")
                    if isinstance(name, str) and name:
                        configured.add(name)
        active_provider, _ = self._active_provider_model()
        if active_provider:
            configured.add(active_provider)
        return configured

    def _provider_has_credentials(self, provider: dict[str, Any]) -> bool:
        env_keys = set(_string_list(provider.get("env")))
        if env_keys & self._dotenv_keys:
            return True
        if any(os.environ.get(key) for key in env_keys):
            return True
        providers = self._config.get("providers")
        provider_id = provider.get("id")
        if isinstance(providers, dict) and isinstance(provider_id, str):
            config = providers.get(provider_id)
            if isinstance(config, dict):
                return any(_SENSITIVE_KEY_RE.search(str(key)) and bool(value) for key, value in config.items())
        return False

    def list_providers(self) -> list[dict[str, Any]]:
        """Return provider catalog entries discovered from Hermes local files."""
        active_provider, _ = self._active_provider_model()
        configured_ids = self._configured_provider_ids()
        providers: dict[str, dict[str, Any]] = {}

        for provider_id, raw in self._model_catalog.items():
            if not isinstance(raw, dict):
                continue
            model_count = self._model_count(raw.get("models"))
            provider = {
                "id": str(raw.get("id") or provider_id),
                "name": str(raw.get("name") or provider_id),
                "api_base_url": _redact_nested(raw.get("api"), "api"),
                "doc_url": _redact_nested(raw.get("doc"), "doc"),
                "npm_package": str(raw.get("npm")) if raw.get("npm") else None,
                "env_keys": _string_list(raw.get("env")),
                "model_count": model_count,
                "configured": provider_id in configured_ids or self._provider_has_credentials(raw),
                "active": provider_id == active_provider,
                "source": "models_dev_cache.json",
            }
            providers[provider["id"]] = provider

        config_providers = self._config.get("providers")
        if isinstance(config_providers, dict):
            for provider_id, raw_config in config_providers.items():
                if provider_id in {"active", "default"}:
                    continue
                provider = providers.get(str(provider_id), {
                    "id": str(provider_id),
                    "name": str(provider_id),
                    "api_base_url": None,
                    "doc_url": None,
                    "npm_package": None,
                    "env_keys": [],
                    "model_count": 0,
                    "source": "config.yaml",
                })
                if isinstance(raw_config, dict):
                    provider["api_base_url"] = provider.get("api_base_url") or _redact_nested(
                        raw_config.get("base_url", raw_config.get("base-url")),
                        "base_url",
                    )
                provider["configured"] = True
                provider["active"] = provider["id"] == active_provider
                providers[provider["id"]] = provider

        return sorted(
            providers.values(),
            key=lambda item: (not bool(item.get("active")), not bool(item.get("configured")), str(item.get("name")).lower()),
        )

    def _model_count(self, models: Any) -> int:
        if isinstance(models, dict):
            return len(models)
        if isinstance(models, list):
            return len(models)
        return 0

    def _iter_catalog_models(self) -> list[dict[str, Any]]:
        models: list[dict[str, Any]] = []
        for provider_id, provider in self._model_catalog.items():
            if not isinstance(provider, dict):
                continue
            provider_name = str(provider.get("name") or provider_id)
            raw_models = provider.get("models")
            if isinstance(raw_models, dict):
                iterable: list[Any] = list(raw_models.values())
            elif isinstance(raw_models, list):
                iterable = raw_models
            else:
                iterable = []
            for raw_model in iterable:
                normalized = self._normalize_model(raw_model, str(provider_id), provider_name)
                if normalized:
                    models.append(normalized)
        return models

    def _normalize_model(self, raw: Any, provider_id: str, provider_name: str) -> dict[str, Any] | None:
        if isinstance(raw, str):
            return {
                "id": raw,
                "name": raw,
                "provider": provider_id,
                "provider_name": provider_name,
                "source": "models_dev_cache.json",
            }
        if not isinstance(raw, dict):
            return None
        model_id = raw.get("id") or raw.get("model") or raw.get("name")
        if not isinstance(model_id, str) or not model_id:
            return None
        raw_cost = raw.get("cost")
        raw_limit = raw.get("limit")
        raw_modalities = raw.get("modalities")
        cost: dict[str, Any] = raw_cost if isinstance(raw_cost, dict) else {}
        limit: dict[str, Any] = raw_limit if isinstance(raw_limit, dict) else {}
        modalities: dict[str, Any] = raw_modalities if isinstance(raw_modalities, dict) else {}
        return {
            "id": model_id,
            "name": str(raw.get("name") or model_id),
            "provider": provider_id,
            "provider_name": provider_name,
            "family": raw.get("family"),
            "context_window": _safe_int(limit.get("context")),
            "output_limit": _safe_int(limit.get("output")),
            "reasoning": bool(raw.get("reasoning")) if "reasoning" in raw else None,
            "tool_call": bool(raw.get("tool_call")) if "tool_call" in raw else None,
            "structured_output": bool(raw.get("structured_output")) if "structured_output" in raw else None,
            "attachments": bool(raw.get("attachment")) if "attachment" in raw else None,
            "open_weights": bool(raw.get("open_weights")) if "open_weights" in raw else None,
            "input_modalities": _string_list(modalities.get("input")),
            "output_modalities": _string_list(modalities.get("output")),
            "input_cost": _safe_float(cost.get("input")),
            "output_cost": _safe_float(cost.get("output")),
            "release_date": raw.get("release_date"),
            "last_updated": raw.get("last_updated"),
            "source": "models_dev_cache.json",
        }

    def _ollama_cloud_models(self) -> list[dict[str, Any]]:
        raw_models = self._ollama_cloud.get("models")
        if not isinstance(raw_models, list):
            return []
        cached_at = self._ollama_cloud.get("cached_at")
        updated_at = None
        if isinstance(cached_at, (int, float)):
            updated_at = datetime.fromtimestamp(cached_at, UTC).isoformat()
        return [
            {
                "id": str(model),
                "name": str(model),
                "provider": "ollama-cloud",
                "provider_name": "Ollama Cloud",
                "last_updated": updated_at,
                "source": "ollama_cloud_models_cache.json",
            }
            for model in raw_models
            if isinstance(model, str) and model
        ]

    def list_models(
        self,
        *,
        provider: str | None = None,
        query: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """Return normalized model options from Hermes local model caches."""
        active_provider, active_model = self._active_provider_model()
        models = self._iter_catalog_models()
        models.extend(self._ollama_cloud_models())

        if active_provider and active_model and not any(
            item["provider"] == active_provider and item["id"] == active_model for item in models
        ):
            models.insert(0, {
                "id": active_model,
                "name": active_model,
                "provider": active_provider,
                "provider_name": active_provider,
                "source": "config.yaml",
            })

        if provider:
            models = [item for item in models if item.get("provider") == provider]
        if query:
            needle = query.casefold()
            models = [
                item for item in models
                if needle in str(item.get("id", "")).casefold()
                or needle in str(item.get("name", "")).casefold()
                or needle in str(item.get("provider", "")).casefold()
            ]

        models.sort(
            key=lambda item: (
                item.get("provider") != active_provider,
                item.get("id") != active_model,
                str(item.get("provider", "")).lower(),
                str(item.get("name", item.get("id", ""))).lower(),
            )
        )
        if limit is not None and limit > 0:
            return models[:limit]
        return models

    def list_skills(self) -> list[dict[str, Any]]:
        """Return installed, bundled, and optional Hermes skills."""
        sources = [
            ("installed", self._hermes_home / "skills"),
            ("bundled", self._hermes_home / "hermes-agent" / "skills"),
            ("optional", self._hermes_home / "hermes-agent" / "optional-skills"),
        ]
        priority = {"installed": 0, "bundled": 1, "optional": 2}
        skills: dict[str, dict[str, Any]] = {}

        for source, root in sources:
            if not root.is_dir():
                continue
            for skill_path in root.rglob("SKILL.md"):
                item = self._skill_from_path(root, skill_path, source)
                existing = skills.get(item["id"])
                if existing and priority[str(existing["source"])] <= priority[source]:
                    continue
                skills[item["id"]] = item

        return sorted(
            skills.values(),
            key=lambda item: (str(item.get("category", "")).lower(), str(item.get("name", "")).lower()),
        )

    def _skill_from_path(self, root: Path, skill_path: Path, source: str) -> dict[str, Any]:
        rel = skill_path.relative_to(root)
        skill_id = str(rel.parent).replace(os.sep, "/") if str(rel.parent) != "." else skill_path.parent.name
        category = skill_id.split("/", 1)[0] if "/" in skill_id else "general"
        try:
            text = skill_path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            text = ""
            metadata: dict[str, Any] = {"warnings": [_nowarnings(skill_path, exc)]}
        else:
            metadata = _parse_frontmatter(text)
        hermes_meta = metadata.get("metadata", {})
        if isinstance(hermes_meta, dict):
            hermes_meta = hermes_meta.get("hermes", {})
        if not isinstance(hermes_meta, dict):
            hermes_meta = {}
        prerequisites = metadata.get("prerequisites")
        stat = skill_path.stat()
        return {
            "id": skill_id,
            "name": str(metadata.get("name") or skill_path.parent.name),
            "title": _title_from_markdown(text, str(metadata.get("name") or skill_path.parent.name)),
            "description": str(metadata.get("description") or ""),
            "category": str(metadata.get("category") or category),
            "version": metadata.get("version"),
            "author": metadata.get("author"),
            "tags": _string_list(hermes_meta.get("tags")),
            "related_skills": _string_list(hermes_meta.get("related_skills")),
            "prerequisites": prerequisites if isinstance(prerequisites, dict) else {},
            "source": source,
            "installed": source == "installed",
            "path": str(skill_path),
            "size_bytes": stat.st_size,
            "updated_at": datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
        }

    def list_mcp_servers(self) -> list[dict[str, Any]]:
        """Return configured MCP servers from Hermes config.yaml."""
        servers = self._config.get("mcp_servers")
        if not isinstance(servers, dict):
            return []
        result: list[dict[str, Any]] = []
        for server_id, raw in servers.items():
            if not isinstance(raw, dict):
                continue
            env = raw.get("env")
            env_keys = sorted(str(key) for key in env) if isinstance(env, dict) else []
            result.append({
                "id": str(server_id),
                "command": _redact_nested(raw.get("command"), "command"),
                "args": _redact_nested(raw.get("args", []), "args"),
                "env_keys": env_keys,
                "env_configured": bool(env_keys),
                "enabled": not bool(raw.get("disabled", False)),
                "source": "config.yaml",
            })
        return sorted(result, key=lambda item: str(item["id"]).lower())

    def list_toolsets(self) -> list[dict[str, Any]]:
        """Return platform and plugin toolsets declared in Hermes config.yaml."""
        toolsets: list[dict[str, Any]] = []
        platform_toolsets = self._config.get("platform_toolsets")
        if isinstance(platform_toolsets, dict):
            for platform, names in platform_toolsets.items():
                for name in _string_list(names):
                    toolsets.append({
                        "id": name,
                        "platform": str(platform),
                        "kind": "platform",
                        "enabled": True,
                        "source": "config.yaml",
                    })

        plugin_toolsets = self._config.get("known_plugin_toolsets")
        if isinstance(plugin_toolsets, dict):
            for platform, names in plugin_toolsets.items():
                for name in _string_list(names):
                    toolsets.append({
                        "id": name,
                        "platform": str(platform),
                        "kind": "plugin",
                        "enabled": True,
                        "source": "config.yaml",
                    })

        for server in self.list_mcp_servers():
            toolsets.append({
                "id": f"{server['id']}:*",
                "platform": "mcp",
                "kind": "mcp",
                "enabled": bool(server.get("enabled")),
                "source": "config.yaml",
            })
        return sorted(toolsets, key=lambda item: (str(item["platform"]), str(item["id"])))

    def summary(self) -> dict[str, Any]:
        active_provider, active_model = self._active_provider_model()
        providers = self.list_providers()
        models = self.list_models()
        skills = self.list_skills()
        mcp_servers = self.list_mcp_servers()
        toolsets = self.list_toolsets()
        return {
            "hermes_home": str(self._hermes_home),
            "config_available": bool(self._config),
            "active_provider": active_provider,
            "active_model": active_model,
            "provider_count": len(providers),
            "configured_provider_count": sum(1 for provider in providers if provider.get("configured")),
            "model_count": len(models),
            "skill_count": len(skills),
            "installed_skill_count": sum(1 for skill in skills if skill.get("installed")),
            "mcp_server_count": len(mcp_servers),
            "toolset_count": len(toolsets),
        }

    def inventory(self) -> dict[str, Any]:
        """Return the full local Hermes inventory payload."""
        providers = self.list_providers()
        models = self.list_models()
        skills = self.list_skills()
        mcp_servers = self.list_mcp_servers()
        toolsets = self.list_toolsets()
        return {
            "summary": self.summary(),
            "providers": providers,
            "models": models,
            "skills": skills,
            "mcp_servers": mcp_servers,
            "toolsets": toolsets,
        }
