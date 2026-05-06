"""Read-only log repository for Hermes log files.

Provides safe, read-only access to Hermes log files.
Never writes to log files. Redacts secrets from log output.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger("hermes_adapter.log_repository")

_REDACT_PATTERNS = [
    (re.compile(r"Bearer\s+\S+", re.IGNORECASE), "Bearer [REDACTED]"),
    (re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*\S+"), r"\1=[REDACTED]"),
    (re.compile(r"\b[a-f0-9]{32,}\b"), "[REDACTED_HEX]"),
    (re.compile(r"(?i)(sk-|tvly-|xai-)[a-zA-Z0-9]+"), "[REDACTED_KEY]"),
]

KNOWN_LOG_FILES = ["agent.log", "errors.log", "gateway.log"]


def _redact_line(line: str) -> str:
    """Redact potential secrets from a log line."""
    for pattern, replacement in _REDACT_PATTERNS:
        line = pattern.sub(replacement, line)
    return line


def get_hermes_logs_dir() -> Path | None:
    """Locate the Hermes logs directory.

    Priority:
    1. HERMES_STUDIO_HERMES_HOME/logs
    2. HERMES_HOME/logs
    3. ~/.hermes/logs
    """
    for var in ("HERMES_STUDIO_HERMES_HOME", "HERMES_HOME"):
        val = os.environ.get(var)
        if val:
            logs_dir = Path(val).expanduser() / "logs"
            if logs_dir.is_dir():
                return logs_dir

    default = Path.home() / ".hermes" / "logs"
    if default.is_dir():
        return default

    return None


class LogRepository:
    """Read-only access to Hermes log files."""

    def __init__(self, logs_dir: Path) -> None:
        self._logs_dir = logs_dir
        self._available = False
        self._log_files: list[str] = []
        self._unavailable_reason: str | None = None
        self._discover_logs()

    def _discover_logs(self) -> None:
        """Discover available log files."""
        try:
            if not self._logs_dir.is_dir():
                self._unavailable_reason = f"Logs directory not found: {self._logs_dir.name}"
                return

            for f in sorted(self._logs_dir.iterdir()):
                if f.is_file() and f.suffix == ".log":
                    self._log_files.append(f.name)

            if not self._log_files:
                self._unavailable_reason = "No .log files found in logs directory"
                return

            self._available = True

        except Exception as e:
            self._unavailable_reason = f"Error discovering logs: {e}"
            logger.warning("Failed to discover logs: %s", e)

    @property
    def available(self) -> bool:
        return self._available

    @property
    def log_files(self) -> list[str]:
        return list(self._log_files)

    def get_status(self) -> dict[str, Any]:
        """Return log repository status for health/bootstrap."""
        return {
            "available": self._available,
            "log_dir": self._logs_dir.name,
            "log_files": self._log_files,
            "unavailable_reason": self._unavailable_reason,
        }

    def get_recent_logs(self, source: str | None = None, tail: int = 100) -> dict[str, Any]:
        """Read recent log lines from a specific log file.

        Args:
            source: Log file name (e.g., "agent.log"). If None, uses first available.
            tail: Number of recent lines to return.

        Returns:
            {"source": str, "lines": [str], "total": int}
        """
        if not self._available:
            return {"source": source or "unknown", "lines": [], "total": 0, "reason": self._unavailable_reason}

        target = source if source and source in self._log_files else self._log_files[0]
        log_path = self._logs_dir / target

        if not log_path.is_file():
            return {"source": target, "lines": [], "total": 0, "reason": f"Log file not found: {target}"}

        try:
            lines = self._read_tail(log_path, tail)
            redacted = [_redact_line(line) for line in lines]
            return {"source": target, "lines": redacted, "total": len(redacted)}
        except Exception as e:
            logger.warning("Failed to read log file %s: %s", target, e)
            return {"source": target, "lines": [], "total": 0, "reason": str(e)}

    def _read_tail(self, path: Path, n: int) -> list[str]:
        """Read the last N lines from a file efficiently."""
        try:
            with open(path, "rb") as f:
                # Seek to end and read backwards
                f.seek(0, 2)
                size = f.tell()
                block_size = min(size, 8192)
                f.seek(max(0, size - block_size))
                data = f.read().decode("utf-8", errors="replace")
                lines = data.splitlines()
                return lines[-n:]
        except Exception:
            # Fallback: read all lines
            with open(path, encoding="utf-8", errors="replace") as f:
                return f.readlines()[-n:]


class LogStreamer:
    """Async generator for streaming log lines from a file."""

    def __init__(self, log_path: Path) -> None:
        self._path = log_path
        self._position = 0

    async def stream(self) -> Any:
        """Yield new log lines as they appear."""
        import asyncio

        if not self._path.is_file():
            return

        # Start from end of file
        with open(self._path, "rb") as f:
            f.seek(0, 2)
            self._position = f.tell()

        while True:
            try:
                with open(self._path, "rb") as f:
                    f.seek(self._position)
                    new_data = f.read()
                    if new_data:
                        self._position = f.tell()
                        text = new_data.decode("utf-8", errors="replace")
                        for line in text.splitlines():
                            yield _redact_line(line)
            except Exception:
                pass

            await asyncio.sleep(1.0)
