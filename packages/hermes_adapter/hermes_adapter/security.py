"""Local authentication utilities for the Hermes Adapter.

Enhanced with token rotation, expiry, rate limiting, and auth attempt logging.
"""

from __future__ import annotations

import logging
import os
import secrets
import time
from pathlib import Path

from fastapi import HTTPException, Request, status

logger = logging.getLogger("hermes_adapter.security")

# ---------------------------------------------------------------------------
# Token state
# ---------------------------------------------------------------------------

_auth_token: str | None = None
_token_created_at: float | None = None

DEFAULT_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60  # 24 hours

# ---------------------------------------------------------------------------
# Rate limiting for auth failures
# ---------------------------------------------------------------------------

_auth_failures: dict[str, list[float]] = {}
_MAX_FAILURES = 10
_FAILURE_WINDOW_SECONDS = 300  # 5 minutes
_MAX_TRACKED_IPS = 10000


def _auth_error(code: str, message: str) -> dict[str, object]:
    return {
        "error": {
            "code": code,
            "message": message,
            "retryable": False,
            "source": "adapter",
            "hint": "Start the adapter and initialize the desktop auth token before calling protected /studio/* endpoints.",
        }
    }


# ---------------------------------------------------------------------------
# Token management
# ---------------------------------------------------------------------------


def set_auth_token(token: str | None) -> None:
    """Set an in-memory auth token (used primarily by tests)."""
    global _auth_token, _token_created_at
    _auth_token = token
    _token_created_at = time.monotonic() if token else None


def generate_token() -> str:
    """Generate a random 32-byte hex token."""
    return secrets.token_hex(32)


def rotate_token() -> str:
    """Generate a new token, replacing the current one. Returns the new token."""
    new_token = generate_token()
    set_auth_token(new_token)
    try:
        write_token(new_token)
    except OSError:
        logger.warning("Failed to persist rotated token to disk")
    logger.info("Auth token rotated")
    return new_token


def is_token_expired(max_age: float = DEFAULT_TOKEN_EXPIRY_SECONDS) -> bool:
    """Return ``True`` if the current token has expired."""
    if _token_created_at is None:
        return True
    return (time.monotonic() - _token_created_at) > max_age


def get_token_path() -> Path:
    """Return the path to the local runtime token file."""
    return Path.home() / ".hermes-local-shell" / "runtime" / "token"


def write_token(token: str) -> None:
    """Write the token to disk with restrictive permissions.

    Creates parent directories if they do not exist.  Uses os.open + os.fdopen
    to avoid TOCTOU between file creation and chmod.
    """
    path = get_token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(token)
    except Exception:
        os.close(fd)
        raise


def read_token() -> str:
    """Read the token from memory or disk.

    Raises:
        FileNotFoundError: If the token file does not exist and no in-memory token is set.
    """
    if _auth_token is not None:
        return _auth_token
    return get_token_path().read_text(encoding="utf-8").strip()


# ---------------------------------------------------------------------------
# Rate limiting helpers
# ---------------------------------------------------------------------------


def _record_failure(client_ip: str) -> None:
    """Record an auth failure for *client_ip*."""
    now = time.monotonic()
    failures = _auth_failures.setdefault(client_ip, [])
    failures.append(now)
    # Prune old entries
    cutoff = now - _FAILURE_WINDOW_SECONDS
    _auth_failures[client_ip] = [t for t in failures if t > cutoff]
    # Evict oldest IPs if map grows too large
    if len(_auth_failures) > _MAX_TRACKED_IPS:
        oldest_ip = min(_auth_failures, key=lambda ip: _auth_failures[ip][0] if _auth_failures[ip] else now)
        del _auth_failures[oldest_ip]


def _is_rate_limited(client_ip: str) -> bool:
    """Return ``True`` if *client_ip* has exceeded the failure threshold."""
    now = time.monotonic()
    failures = _auth_failures.get(client_ip, [])
    cutoff = now - _FAILURE_WINDOW_SECONDS
    recent = [t for t in failures if t > cutoff]
    _auth_failures[client_ip] = recent
    return len(recent) >= _MAX_FAILURES


def _client_ip(request: Request) -> str:
    """Extract client IP from the request."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


async def require_token(request: Request) -> None:
    """FastAPI dependency that validates the Bearer token header.

    Includes rate limiting on auth failures and logs all auth attempts.

    Raises:
        HTTPException: 401 if the token is missing or invalid.
        HTTPException: 429 if rate limit is exceeded.
    """
    ip = _client_ip(request)

    # Rate limit check
    if _is_rate_limited(ip):
        logger.warning("Auth rate limit exceeded for %s", ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_auth_error("rate_limited", "Too many failed authentication attempts"),
        )

    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        _record_failure(ip)
        logger.warning("Auth failed (missing header) from %s", ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error("auth_missing", "Missing or invalid Authorization header"),
            headers={"WWW-Authenticate": "Bearer"},
        )

    provided = auth[7:].strip()
    try:
        expected = read_token()
    except FileNotFoundError as exc:
        _record_failure(ip)
        logger.warning("Auth failed (token uninitialized) from %s", ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error("auth_uninitialized", "Token not initialized"),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if not secrets.compare_digest(provided, expected):
        _record_failure(ip)
        logger.warning("Auth failed (invalid token) from %s", ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error("auth_invalid", "Invalid token"),
            headers={"WWW-Authenticate": "Bearer"},
        )

    logger.info("Auth succeeded from %s", ip)
