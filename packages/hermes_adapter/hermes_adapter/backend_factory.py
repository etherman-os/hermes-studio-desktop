"""Backend factory — creates the appropriate backend based on configuration."""

from __future__ import annotations

from typing import Any

from hermes_adapter.backend_base import StudioBackend
from hermes_adapter.backend_config import get_backend_mode, get_hermes_api_key, get_hermes_api_url
from hermes_adapter.hermes_backend import HermesBackend
from hermes_adapter.mock_backend import MockBackend


async def create_backend() -> tuple[StudioBackend, dict[str, Any]]:
    """Create and return the appropriate backend based on env config.

    Returns:
        (backend_instance, status_info) where status_info describes
        the backend mode and Hermes availability.
    """
    mode = get_backend_mode()
    hermes_url = get_hermes_api_url()
    hermes_key = get_hermes_api_key()

    if mode == "mock":
        backend: StudioBackend = MockBackend()
        return backend, {
            "backend_mode": "mock",
            "hermes_url": hermes_url,
            "hermes_connected": False,
            "fallback_reason": "HERMES_STUDIO_BACKEND=mock",
        }

    if mode == "hermes":
        backend = HermesBackend(hermes_url, hermes_key)
        health = await backend.health()
        return backend, {
            "backend_mode": "hermes",
            "hermes_url": hermes_url,
            "hermes_connected": health.get("hermes_connected", False),
            "hermes_last_error": health.get("hermes_last_error"),
        }

    # auto mode: try Hermes, fall back to mock
    hermes = HermesBackend(hermes_url, hermes_key)
    health = await hermes.health()

    if health.get("hermes_connected", False):
        return hermes, {
            "backend_mode": "auto",
            "active_backend": "hermes",
            "hermes_url": hermes_url,
            "hermes_connected": True,
        }

    # Hermes unavailable — close its client and fall back to mock
    await hermes.close()
    mock = MockBackend()
    return mock, {
        "backend_mode": "auto",
        "active_backend": "mock",
        "hermes_url": hermes_url,
        "hermes_connected": False,
        "fallback_reason": f"Hermes unavailable: {health.get('hermes_last_error', 'unknown')}",
    }
