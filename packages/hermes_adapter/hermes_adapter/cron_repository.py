"""Studio-owned cron job repository.

Cron data is read from ~/.hermes/cron/ directory. This module is read-only
and never modifies cron job definitions or state.

The cron directory structure:
  ~/.hermes/cron/
    *.yaml or *.json  - cron job definitions
    output/           - job output logs
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger("hermes_adapter.cron_repository")

_HERMES_HOME_VARS = ("HERMES_STUDIO_HERMES_HOME", "HERMES_HOME")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _get_hermes_home() -> Path:
    for var in _HERMES_HOME_VARS:
        val = os.environ.get(var)
        if val:
            return Path(val).expanduser()
    return Path.home() / ".hermes"


def _safe_text(value: Any, *, max_length: int, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value)
    text = _CONTROL_RE.sub("", text).strip()
    if len(text) > max_length:
        return text[:max_length].rstrip()
    return text


def _parse_cron_schedule(expression: str) -> str:
    """Convert a cron expression to a human-readable string.

    Standard cron format: minute hour day_of_month month day_of_week
    """
    parts = expression.strip().split()
    if len(parts) < 5:
        return expression

    minute, hour, dom, month, dow = parts[:5]

    if minute == "*" and hour == "*":
        return "Every minute"
    if minute.startswith("*/") and hour == "*":
        interval = minute[2:]
        return f"Every {interval} minutes"
    if hour == "*" and minute != "*":
        return f"Every hour at :{minute.zfill(2)}"
    if hour.startswith("*/") and dom == "*" and month == "*" and dow == "*":
        interval = hour[2:]
        return f"Every {interval} hours"
    if dom == "*" and month == "*" and dow == "*":
        return f"Daily at {hour.zfill(2)}:{minute.zfill(2)}"
    if dow != "*" and dom == "*" and month == "*":
        day_names = {
            "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday",
            "4": "Thursday", "5": "Friday", "6": "Sunday",
            "7": "Sunday", "sun": "Sunday", "mon": "Monday",
            "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday",
            "fri": "Friday", "sat": "Saturday",
        }
        day = day_names.get(dow.lower(), dow)
        return f"Every {day} at {hour.zfill(2)}:{minute.zfill(2)}"
    if dom != "*" and month == "*":
        return f"Monthly on day {dom} at {hour.zfill(2)}:{minute.zfill(2)}"

    return expression


def _estimate_next_run(schedule: str, last_run: str | None) -> str | None:
    """Estimate next run time. Returns ISO string or None."""
    return None


def _load_yaml_safe(text: str) -> dict[str, Any] | None:
    """Try to parse YAML-like content as simple key-value. Falls back to None."""
    try:
        import yaml

        result = yaml.safe_load(text)
        if isinstance(result, dict):
            return result
    except yaml.YAMLError as e:
        logger.debug("Failed to parse YAML content: %s", e)
    return None


class CronRepository:
    """Read-only access to Hermes cron job definitions."""

    def __init__(self, hermes_home: Path | None = None) -> None:
        self._hermes_home = hermes_home or _get_hermes_home()
        self._cron_dir = self._hermes_home / "cron"
        self._available = self._cron_dir.is_dir()

    @property
    def available(self) -> bool:
        return self._available

    @property
    def cron_dir(self) -> Path:
        return self._cron_dir

    def get_status(self) -> dict[str, Any]:
        """Return repository status for health/bootstrap."""
        job_count = 0
        if self._available:
            job_count = len(self._scan_job_files())
        return {
            "available": self._available,
            "cron_dir": str(self._cron_dir),
            "job_count": job_count,
        }

    def list_jobs(self, *, limit: int = 100) -> dict[str, Any]:
        """List cron jobs from the cron directory.

        Returns:
            {"jobs": [...], "total": N, "source": "cron_dir"}
        """
        if not self._available:
            return {"jobs": [], "total": 0, "source": "unavailable", "reason": "Cron directory not found"}

        jobs = self._load_all_jobs()
        total = len(jobs)
        jobs = jobs[:min(max(limit, 1), 250)]
        return {"jobs": jobs, "total": total, "source": "cron_dir"}

    def get_job(self, job_id: str) -> dict[str, Any]:
        """Get a single cron job by ID."""
        if not self._available:
            raise ValueError(f"Cron job '{job_id}' not found")

        for job_file in self._scan_job_files():
            job = self._load_job_file(job_file)
            if job and job.get("id") == job_id:
                return job
        raise ValueError(f"Cron job '{job_id}' not found")

    def _scan_job_files(self) -> list[Path]:
        """Find all cron job definition files."""
        files: list[Path] = []
        for ext in ("*.yaml", "*.yml", "*.json"):
            files.extend(self._cron_dir.glob(ext))
        return sorted(files, key=lambda p: p.name)

    def _load_all_jobs(self) -> list[dict[str, Any]]:
        """Load and parse all cron job files."""
        jobs: list[dict[str, Any]] = []
        for job_file in self._scan_job_files():
            job = self._load_job_file(job_file)
            if job:
                jobs.append(job)
        return jobs

    def _load_job_file(self, path: Path) -> dict[str, Any] | None:
        """Load and parse a single cron job file."""
        try:
            text = path.read_text(encoding="utf-8")
            if path.suffix == ".json":
                data = json.loads(text)
            else:
                data = _load_yaml_safe(text)
                if data is None:
                    data = json.loads(text)
        except Exception as e:
            logger.debug("Failed to parse cron file %s: %s", path, e)
            return None

        if not isinstance(data, dict):
            return None

        job_id = _safe_text(
            data.get("id") or data.get("name") or path.stem,
            max_length=128,
            fallback=path.stem,
        )
        schedule_raw = _safe_text(
            data.get("schedule") or data.get("cron") or data.get("expression"),
            max_length=100,
        )
        command = _safe_text(
            data.get("command") or data.get("cmd") or data.get("prompt") or data.get("task"),
            max_length=2000,
        )
        status = _safe_text(data.get("status", "active"), max_length=32) or "active"
        last_run = _safe_text(data.get("last_run") or data.get("last_run_at"), max_length=80)
        next_run = _safe_text(data.get("next_run") or data.get("next_run_at"), max_length=80)
        description = _safe_text(data.get("description") or data.get("desc"), max_length=500)

        schedule_human = _parse_cron_schedule(schedule_raw) if schedule_raw else "Unknown"

        return {
            "id": job_id,
            "name": _safe_text(data.get("name") or job_id, max_length=200),
            "schedule": schedule_raw,
            "schedule_human": schedule_human,
            "command": command,
            "description": description,
            "status": status,
            "last_run": last_run or None,
            "next_run": next_run or None,
            "enabled": data.get("enabled", True),
            "source_file": path.name,
            "created_at": _safe_text(data.get("created_at"), max_length=80),
            "updated_at": _safe_text(data.get("updated_at"), max_length=80),
        }
