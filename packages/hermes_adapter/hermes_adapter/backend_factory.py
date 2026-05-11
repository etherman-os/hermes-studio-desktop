"""Backend factory — creates the appropriate backend based on configuration."""

from __future__ import annotations

import asyncio
from typing import Any

from hermes_adapter.backend_base import StudioBackend
from hermes_adapter.backend_config import (
    get_backend_mode,
    get_hermes_api_key,
    get_hermes_api_url,
    get_remote_hermes_bin,
    get_remote_ssh_target,
)
from hermes_adapter.hermes_backend import HermesBackend
from hermes_adapter.hermes_cli_backend import HermesCliBackend
from hermes_adapter.mock_backend import MockBackend

_HEALTH_TIMEOUT_SECONDS = 10.0


async def _health_with_timeout(backend: StudioBackend) -> dict[str, Any]:
    """Call backend.health() with a fixed timeout to prevent indefinite hangs."""
    try:
        return await asyncio.wait_for(backend.health(), timeout=_HEALTH_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        return {"status": "unavailable", "reason": "Health check timed out"}
    except Exception as e:
        return {"status": "unavailable", "reason": str(e)}


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

    if mode == "local":
        backend = HermesCliBackend(hermes_url, hermes_key)
        health = await _health_with_timeout(backend)
        return backend, {
            "backend_mode": "local",
            "active_backend": "local-cli",
            "hermes_url": hermes_url,
            "hermes_connected": health.get("hermes_connected", False),
            "hermes_last_error": health.get("hermes_last_error"),
        }

    if mode in {"gateway", "hermes"}:
        backend = HermesBackend(hermes_url, hermes_key)
        health = await _health_with_timeout(backend)
        return backend, {
            "backend_mode": "gateway",
            "hermes_url": hermes_url,
            "hermes_connected": health.get("hermes_connected", False),
            "hermes_last_error": health.get("hermes_last_error"),
        }

    if mode == "ssh":
        target = get_remote_ssh_target()
        if not target:
            backend = MockBackend()
            return backend, {
                "backend_mode": "ssh",
                "active_backend": "mock",
                "hermes_url": hermes_url,
                "hermes_connected": False,
                "fallback_reason": "HERMES_STUDIO_REMOTE_SSH_TARGET is not configured",
            }
        backend = HermesCliBackend(
            hermes_url,
            hermes_key,
            remote_ssh_target=target,
            remote_hermes_bin=get_remote_hermes_bin(),
        )
        health = await _health_with_timeout(backend)
        return backend, {
            "backend_mode": "ssh",
            "active_backend": "ssh",
            "remote_ssh_target": target,
            "hermes_connected": health.get("hermes_connected", False),
            "hermes_last_error": health.get("hermes_last_error"),
        }

    # auto mode: prefer local CLI, then Hermes gateway, then mock.
    local = HermesCliBackend(hermes_url, hermes_key)
    local_health = await _health_with_timeout(local)
    if local_health.get("hermes_connected", False):
        return local, {
            "backend_mode": "auto",
            "active_backend": "local-cli",
            "hermes_url": hermes_url,
            "hermes_connected": True,
        }
    await local.close()

    gateway = HermesBackend(hermes_url, hermes_key)
    health = await _health_with_timeout(gateway)

    if health.get("hermes_connected", False):
        return gateway, {
            "backend_mode": "auto",
            "active_backend": "gateway",
            "hermes_url": hermes_url,
            "hermes_connected": True,
        }

    await gateway.close()
    mock = MockBackend()
    return mock, {
        "backend_mode": "auto",
        "active_backend": "mock",
        "hermes_url": hermes_url,
        "hermes_connected": False,
        "fallback_reason": (
            "Hermes local CLI and gateway unavailable: "
            f"{local_health.get('hermes_last_error') or 'CLI unavailable'}; "
            f"{health.get('hermes_last_error', 'gateway unavailable')}"
        ),
    }
