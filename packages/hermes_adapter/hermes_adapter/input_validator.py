"""Input validation utilities for the Hermes Desktop Studio adapter.

Provides sanitisation for file paths, JSON payload validation, and
request-size enforcement.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024  # 2 MiB
MAX_STRING_FIELD_LENGTH = 100_000
MAX_ID_LENGTH = 256

_ID_RE = re.compile(r"^[A-Za-z0-9_.\-:|/]{1,256}$")
_SAFE_PATH_RE = re.compile(r"^[A-Za-z0-9_./\-~@ ]+$")


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ValidationError(Exception):
    """Raised when input fails validation."""


# ---------------------------------------------------------------------------
# Scalar validators
# ---------------------------------------------------------------------------


def validate_id(value: str, *, field: str = "id") -> str:
    """Validate an identifier (alphanumeric, dots, dashes, underscores, colons, pipes, slashes)."""
    if not isinstance(value, str) or not value:
        raise ValidationError(f"{field} must be a non-empty string")
    if len(value) > MAX_ID_LENGTH:
        raise ValidationError(f"{field} exceeds max length {MAX_ID_LENGTH}")
    if not _ID_RE.match(value):
        raise ValidationError(f"{field} contains invalid characters")
    return value


def validate_string_field(value: str, *, field: str = "field", max_length: int = MAX_STRING_FIELD_LENGTH) -> str:
    """Validate a general string field."""
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be a string")
    if len(value) > max_length:
        raise ValidationError(f"{field} exceeds max length {max_length}")
    return value


def validate_optional_string(value: Any, *, field: str = "field", max_length: int = MAX_STRING_FIELD_LENGTH) -> str | None:
    """Validate an optional string field; returns ``None`` if *value* is ``None``."""
    if value is None:
        return None
    return validate_string_field(value, field=field, max_length=max_length)


# ---------------------------------------------------------------------------
# File path sanitisation
# ---------------------------------------------------------------------------


def sanitize_file_path(raw: str, *, base_dir: Path | None = None) -> Path:
    """Sanitise and validate a user-supplied file path string.

    - Rejects empty / whitespace-only strings.
    - Rejects paths containing ``..`` traversal.
    - Rejects paths with null bytes.
    - If *base_dir* is given, ensures the resolved path stays inside it.

    Returns a ``pathlib.Path`` on success.

    Raises:
        ValidationError: If the path is unsafe.
    """
    if not isinstance(raw, str) or not raw.strip():
        raise ValidationError("File path must be a non-empty string")

    if "\x00" in raw:
        raise ValidationError("File path contains null byte")

    if ".." in raw:
        raise ValidationError("Path traversal (..) is not allowed")

    path = Path(raw).expanduser()

    if base_dir is not None:
        try:
            resolved = path.resolve(strict=False)
            base = base_dir.expanduser().resolve(strict=False)
        except OSError as exc:
            raise ValidationError(f"Cannot resolve path: {exc}") from exc
        if not (resolved == base or str(resolved).startswith(str(base) + "/")):
            raise ValidationError(f"Path outside allowed directory: {resolved}")

    return path


# ---------------------------------------------------------------------------
# JSON payload validation
# ---------------------------------------------------------------------------


def validate_json_payload(
    data: Any,
    *,
    required_keys: set[str] | None = None,
    optional_keys: set[str] | None = None,
    max_total_bytes: int = MAX_REQUEST_BODY_BYTES,
) -> dict[str, Any]:
    """Validate a JSON payload.

    - *data* must be a ``dict``.
    - *required_keys* – all must be present.
    - *optional_keys* – if given, only these (plus required) keys are allowed.
    - *max_total_bytes* – serialised size must not exceed this.

    Raises:
        ValidationError: On any violation.
    """
    if not isinstance(data, dict):
        raise ValidationError("Payload must be a JSON object")

    if required_keys:
        missing = required_keys - data.keys()
        if missing:
            raise ValidationError(f"Missing required keys: {', '.join(sorted(missing))}")

    if optional_keys is not None:
        allowed = (required_keys or set()) | optional_keys
        unexpected = data.keys() - allowed
        if unexpected:
            raise ValidationError(f"Unexpected keys: {', '.join(sorted(unexpected))}")

    # Size check
    try:
        size = len(json.dumps(data, default=str).encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"Cannot serialise payload: {exc}") from exc

    if size > max_total_bytes:
        raise ValidationError(f"Payload size {size} exceeds limit {max_total_bytes}")

    return data


# ---------------------------------------------------------------------------
# Request body size guard (for raw bytes)
# ---------------------------------------------------------------------------


def check_request_size(body: bytes, *, max_bytes: int = MAX_REQUEST_BODY_BYTES) -> None:
    """Raise ``ValidationError`` if *body* exceeds *max_bytes*."""
    if len(body) > max_bytes:
        raise ValidationError(f"Request body size {len(body)} exceeds limit {max_bytes}")


# --------------------------------------------------------------------------
# Request body size middleware
# --------------------------------------------------------------------------


def make_body_size_middleware(max_bytes: int = MAX_REQUEST_BODY_BYTES):
    """Return a FastAPI middleware that enforces max request body size.

    Usage:
        from fastapi import FastAPI
        from hermes_adapter.input_validator import make_body_size_middleware
        app = FastAPI()
        app.add_middleware(make_body_size_middleware())
    """
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import Response

    async def dispatch(request: Request, call_next) -> Response:
        if request.method in ("POST", "PUT", "PATCH"):
            content_length = request.headers.get("content-length")
            if content_length is not None:
                try:
                    if int(content_length) > max_bytes:
                        from fastapi import HTTPException
                        raise HTTPException(
                            status_code=413,
                            detail=f"Request body too large (max {max_bytes} bytes)",
                        )
                except ValueError:
                    pass
            # For chunked transfer, read body up to limit and raise if exceeded
            try:
                body = await request.body()
                if len(body) > max_bytes:
                    from fastapi import HTTPException
                    raise HTTPException(
                        status_code=413,
                        detail=f"Request body too large (max {max_bytes} bytes)",
                    )
                # Reconstruct request with cached body for downstream handlers
                async def receive():
                    return {"type": "http.request", "body": body}

                request._receive = receive
            except Exception:
                raise
        return await call_next(request)

    return BaseHTTPMiddleware(dispatch)
