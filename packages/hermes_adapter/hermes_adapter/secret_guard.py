"""Enhanced secret detection, redaction, and file path validation.

Centralizes all secret patterns so every repository uses the same guard.
Provides file-path validation, content-size limits, and audit logging for
redaction events.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger("hermes_adapter.secret_guard")

# ---------------------------------------------------------------------------
# Secret patterns – keys
# ---------------------------------------------------------------------------

SECRET_KEY_RE = re.compile(
    r"(?i)(api[_-]?key|token|secret|password|auth|bearer|credential|private[_-]?key)"
)

# ---------------------------------------------------------------------------
# Secret patterns – values
# ---------------------------------------------------------------------------

_SECRET_VALUE_PATTERNS: tuple[re.Pattern[str], ...] = (
    # Bearer tokens
    re.compile(r"Bearer\s+\S+", re.IGNORECASE),
    # OpenAI / xAI / Tavily style keys
    re.compile(r"(?i)\b(sk-|xai-|tvly-)[a-zA-Z0-9]{20,}"),
    # AWS Access Key ID
    re.compile(r"\b(AKIA[0-9A-Z]{16})\b"),
    # AWS Secret Access Key (40 chars, base64-ish)
    re.compile(r"(?i)aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*['\"]?[A-Za-z0-9/+=]{40}['\"]?"),
    # GitHub personal access tokens (ghp_, gho_, ghu_, ghs_, ghr_)
    re.compile(r"\b(ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36})\b"),
    # GitHub fine-grained tokens (github_pat_)
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{22,}\b"),
    # JWT tokens (three base64url segments separated by dots)
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    # PEM private key blocks
    re.compile(r"-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----", re.IGNORECASE),
    # Generic hex tokens (32+ chars) – kept last to avoid over-matching
    re.compile(r"\b[a-f0-9]{32,}\b", re.IGNORECASE),
    # key=value secret assignments
    re.compile(r"(?i)\b(api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[^'\"\\s]{8,}"),
)

# Sensitive key names (lowered, underscores) for dict-based redaction
_SENSITIVE_KEY_NAMES: set[str] = {
    "api_key", "api-key", "apikey", "token", "secret", "password",
    "auth", "bearer", "credential", "private_key", "private-key",
    "aws_access_key_id", "aws_secret_access_key",
    "openai_api_key", "anthropic_api_key", "google_api_key",
    "xai_api_key", "nous_api_key", "github_token",
}

# ---------------------------------------------------------------------------
# Audit callback (optional, set via configure())
# ---------------------------------------------------------------------------

_redaction_audit_callback: Any = None


def configure(audit_callback: Any = None) -> None:
    """Set an optional callback invoked for every redaction event."""
    global _redaction_audit_callback
    _redaction_audit_callback = audit_callback


def _audit_redaction(source: str, field: str, original_length: int) -> None:
    """Log a redaction event and invoke the audit callback if set."""
    logger.info(
        "secret_guard.redaction source=%s field=%s original_length=%d",
        source,
        field,
        original_length,
    )
    if _redaction_audit_callback is not None:
        try:
            _redaction_audit_callback(source=source, field=field, original_length=original_length)
        except Exception:  # pragma: no cover – audit must never break the caller
            logger.debug("Audit callback failed", exc_info=True)


# ---------------------------------------------------------------------------
# Redaction helpers
# ---------------------------------------------------------------------------


def redact_text(value: str, *, source: str = "", field: str = "") -> str:
    """Replace secret-like substrings in *value* with ``[REDACTED]``."""
    redacted = value
    for pattern in _SECRET_VALUE_PATTERNS:
        new = pattern.sub("[REDACTED]", redacted)
        if new != redacted:
            _audit_redaction(source or "text", field or "<inline>", len(redacted))
            redacted = new
    return redacted


def is_secret_key(key: str) -> bool:
    """Return ``True`` if *key* looks like it holds a secret."""
    return bool(SECRET_KEY_RE.search(key))


def is_secret_value(value: str) -> bool:
    """Return ``True`` if *value* contains a secret-like pattern."""
    return any(p.search(value) for p in _SECRET_VALUE_PATTERNS)


def redact_dict(data: dict[str, Any], *, source: str = "") -> dict[str, Any]:
    """Return a shallow copy of *data* with secret values redacted."""
    out: dict[str, Any] = {}
    for k, v in data.items():
        clean_key = k.lower().replace("-", "_")
        if clean_key in _SENSITIVE_KEY_NAMES or is_secret_key(k):
            if v:
                _audit_redaction(source or "dict", k, len(str(v)))
            out[k] = "[REDACTED]" if v else ""
        elif isinstance(v, str) and is_secret_value(v):
            _audit_redaction(source or "dict", k, len(v))
            out[k] = redact_text(v, source=source, field=k)
        elif isinstance(v, dict):
            out[k] = redact_dict(v, source=source)
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------------------
# File path validation
# ---------------------------------------------------------------------------

_MAX_PATH_DEPTH = 20
_TRAVERSAL_RE = re.compile(r"(\.\.[\\/])|([\\/]\.\.)")


def validate_file_path(path: Path, *, base_dir: Path | None = None) -> Path:
    """Validate *path* for safety.

    Rules:
    - Reject symlinks (unless the target is inside *base_dir*).
    - Reject path traversal (``..`` components).
    - Reject excessively deep paths.
    - If *base_dir* is given, ensure the resolved path stays inside it.

    Returns the resolved path on success.

    Raises:
        ValueError: If the path is unsafe.
    """
    try:
        resolved = path.expanduser().resolve(strict=False)
    except OSError as exc:
        raise ValueError(f"Cannot resolve path: {exc}") from exc

    # Reject symlinks
    try:
        if path.is_symlink():
            if base_dir is not None:
                target = path.resolve(strict=True)
                base = base_dir.expanduser().resolve(strict=False)
                if not str(target).startswith(str(base) + os.sep) and target != base:
                    raise ValueError(f"Symlink target outside allowed directory: {path}")
            else:
                raise ValueError(f"Symlink not allowed: {path}")
        # Also check the resolved path for symlinks in its ancestry
        if resolved.is_symlink():
            raise ValueError(f"Symlink not allowed in resolved path: {resolved}")
    except OSError:
        pass

    # Reject traversal
    if _TRAVERSAL_RE.search(str(path)):
        raise ValueError(f"Path traversal not allowed: {path}")

    # Reject excessively deep paths
    parts = resolved.parts
    if len(parts) > _MAX_PATH_DEPTH:
        raise ValueError(f"Path too deep ({len(parts)} > {_MAX_PATH_DEPTH}): {path}")

    # Base directory containment
    if base_dir is not None:
        base = base_dir.expanduser().resolve(strict=False)
        if not (resolved == base or str(resolved).startswith(str(base) + os.sep)):
            raise ValueError(f"Path outside allowed directory: {resolved}")

    return resolved


# ---------------------------------------------------------------------------
# Content size limits
# ---------------------------------------------------------------------------

DEFAULT_MAX_CONTENT_BYTES = 10 * 1024 * 1024  # 10 MiB


def check_content_size(content: str | bytes, *, max_bytes: int = DEFAULT_MAX_CONTENT_BYTES) -> None:
    """Raise ``ValueError`` if *content* exceeds *max_bytes*."""
    size = len(content.encode("utf-8")) if isinstance(content, str) else len(content)
    if size > max_bytes:
        raise ValueError(f"Content size {size} exceeds limit {max_bytes} bytes")
