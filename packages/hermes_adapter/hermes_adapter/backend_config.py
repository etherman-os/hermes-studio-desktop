"""Backend mode configuration for Hermes Desktop Studio adapter."""

from __future__ import annotations

import os
from typing import Literal

BackendMode = Literal["mock", "local", "gateway", "hermes", "ssh", "auto"]


def get_backend_mode() -> BackendMode:
    """Read backend mode from HERMES_STUDIO_BACKEND env var.

    Returns:
        "mock" | "local" | "gateway"/"hermes" | "ssh" | "auto" (default: "local")
    """
    raw = os.environ.get("HERMES_STUDIO_BACKEND", "local").lower().strip()
    if raw in ("mock", "local", "cli", "gateway", "hermes", "ssh", "auto"):
        if raw == "cli":
            return "local"
        return raw  # type: ignore[return-value]
    return "local"


def get_hermes_api_url() -> str:
    """Read Hermes API base URL from env var.

    Returns:
        Default: "http://127.0.0.1:8642"
    """
    return os.environ.get("HERMES_API_BASE_URL", "http://127.0.0.1:8642").rstrip("/")


def get_hermes_api_key() -> str | None:
    """Read optional Hermes API key from env var.

    Returns:
        API key string or None.
    """
    return os.environ.get("HERMES_API_KEY") or None


def get_remote_ssh_target() -> str | None:
    """Read optional remote SSH target for VPS-backed Hermes mode."""
    return os.environ.get("HERMES_STUDIO_REMOTE_SSH_TARGET") or None


def get_remote_hermes_bin() -> str:
    """Read Hermes executable path used on the remote SSH host.

    Returns:
        Validated path to hermes binary (no shell metacharacters allowed).
        Defaults to "hermes" if env var is empty or contains unsafe characters.
    """
    raw = os.environ.get("HERMES_STUDIO_REMOTE_HERMES_BIN", "hermes").strip()
    if not raw:
        return "hermes"
    # Reject any shell metacharacters that could enable command injection
    unsafe_chars = set(";&|`$(){}[]<>?!*#\"'\\n\\r\\t")
    if any(c in unsafe_chars for c in raw):
        return "hermes"
    # Reject paths with traversal or absolute-looking paths that could escape intent
    if raw.startswith("/") or ".." in raw or "/" in raw.lstrip("."):
        return "hermes"
    # Enforce max length to prevent abuse
    if len(raw) > 256:
        return "hermes"
    return raw


def get_cli_run_timeout_seconds() -> float:
    """Read local/remote CLI run timeout."""
    raw = os.environ.get("HERMES_STUDIO_CLI_RUN_TIMEOUT", "3600")
    try:
        value = float(raw)
    except ValueError:
        return 3600.0
    return max(30.0, min(value, 24 * 3600.0))


def get_debug_events() -> bool:
    """Check if debug event logging is enabled.

    Returns:
        True if HERMES_STUDIO_DEBUG_EVENTS=1
    """
    return os.environ.get("HERMES_STUDIO_DEBUG_EVENTS", "0") == "1"
