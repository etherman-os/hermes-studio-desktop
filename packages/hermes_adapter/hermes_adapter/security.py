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

from hermes_adapter.file_utils import safe_write

logger = logging.getLogger("hermes_adapter.security")

# ---------------------------------------------------------------------------
# Token state
# ---------------------------------------------------------------------------

_auth_token: str | None = None
_token_created_at: float | None = None
# Monotonic timestamp when the file-based token was first read.
_file_token_checked_at: float | None = None
_file_token_mtime_at_read: float | None = None

DEFAULT_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60  # 24 hours

# ---------------------------------------------------------------------------
# Rate limiting for auth failures
# ---------------------------------------------------------------------------

_auth_failures: dict[str, list[float]] = {}
_MAX_FAILURES = 10
_FAILURE_WINDOW_SECONDS = 300  # 5 minutes
_MAX_TRACKED_IPS = 10000
_AUTH_FAILURES_FILE = ".hermes-local-shell/runtime/auth_failures.json"


def _get_auth_failures_path() -> Path:
    return Path.home() / _AUTH_FAILURES_FILE


def _load_auth_failures_from_disk() -> dict[str, list[float]]:
    """Load persisted auth failure timestamps from disk for durability across restarts."""
    path = _get_auth_failures_path()
    if not path.exists():
        return {}
    try:
        import json
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            result: dict[str, list[float]] = {}
            for ip, timestamps in data.items():
                if isinstance(timestamps, list):
                    result[str(ip)] = [float(t) for t in timestamps if isinstance(t, (int, float))]
            return result
    except (OSError, json.JSONDecodeError) as e:
        logger.debug("Could not load auth failures from %s: %s", path, e)
    return {}


def _save_auth_failures_to_disk(failures: dict[str, list[float]]) -> None:
    """Persist auth failure timestamps to disk for durability across restarts."""
    path = _get_auth_failures_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        import json
        path.write_text(json.dumps(failures), encoding="utf-8")
    except OSError:
        logger.warning("Failed to persist auth failures to disk")


def _record_failure(client_ip: str) -> None:
    """Record an auth failure for *client_ip* with optional audit trail logging."""
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
    # Persist to disk for durability across restarts
    _save_auth_failures_to_disk(_auth_failures)
    # Log to audit trail if available
    try:
        from hermes_adapter.audit_logger import get_audit_logger
        audit = get_audit_logger()
        if audit:
            audit.log_auth(client_ip, success=False, detail={"reason": "auth_failure", "failure_count": len(_auth_failures.get(client_ip, []))})
    except Exception:  # noqa: S110 — Audit logging must never break auth flow
        pass


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
    """Return ``True`` if the current token has expired.

    All expiry checks use time.monotonic() for consistency: the in-memory
    token creation time and the file-based token mtime are both compared
    using the same monotonic clock. For file-based tokens, the monotonic
    check time is captured at first read and stored in module state so
    that subsequent checks use the same reference point.
    """
    if _token_created_at is not None:
        return (time.monotonic() - _token_created_at) > max_age

    path = get_token_path()
    mtime: float | None = None
    try:
        mtime = path.stat().st_mtime
        if _file_token_mtime_at_read is None or _file_token_mtime_at_read != mtime:  # type: ignore[used-before-def]  # noqa: F823
            # First read or file was replaced — reset the monotonic reference
            _file_token_mtime_at_read = mtime
            _file_token_checked_at = time.monotonic()
        # Compute age relative to the reference point captured at first read.
        # Using time.monotonic() for both sides of the subtraction ensures
        # the comparison is monotonic: the file mtime is only used to decide
        # whether to reset the reference point, not to compute the age.
        return (time.monotonic() - _file_token_checked_at) > max_age
    except FileNotFoundError:
        return True


def get_token_path() -> Path:
    """Return the path to the local runtime token file."""
    return Path.home() / ".hermes-local-shell" / "runtime" / "token"


def write_token(token: str) -> None:
    """Write the token to disk with restrictive permissions using atomic write.

    Creates parent directories if they do not exist. Sets 0o600 permissions
    after the atomic rename to avoid TOCTOU issues.
    """
    path = get_token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    safe_write(path, token)
    # Set restrictive permissions after atomic rename
    try:
        os.chmod(str(path), 0o600)
    except OSError:
        logger.warning("Failed to set permissions on token file")


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

    if is_token_expired():
        _record_failure(ip)
        logger.warning("Auth failed (token expired) from %s", ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error("auth_expired", "Token expired"),
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not secrets.compare_digest(provided, expected):
        _record_failure(ip)
        logger.warning("Auth failed (invalid token) from %s", ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_auth_error("auth_invalid", "Invalid token"),
            headers={"WWW-Authenticate": "Bearer"},
        )

    logger.info("Auth succeeded from %s", ip)
