"""HoldTheGoblin read-only status probe for Studio adapter.

This module provides read-only inspection of HoldTheGoblin CLI:
- Availability detection (local checkout or PATH)
- doctor: project detection and scanner configuration
- events: recent event log
- checkpoint_list: existing checkpoints (read-only, no mutation)

Hard rules for this pilot:
- NO checkpoint_create
- NO checkpoint_rollback
- NO deploy_run
- NO verify (full run)
- NO readiness with runVerify=true
- NO policy_evaluate / risk_assess
"""

from __future__ import annotations

import asyncio
import json as _json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# HoldTheGoblin local checkout path
HTG_LOCAL_CHECKOUT = Path("/root/projects/HoldTheGoblin")
HTG_CLI_LOCAL = HTG_LOCAL_CHECKOUT / "dist" / "src" / "cli.js"

# HTG CLI must be built before use
_HTG_BUILD_REQUIRED = (
    "HoldTheGoblin local checkout found but not built. "
    "Run: cd /root/projects/HoldTheGoblin && npm ci && npm run build"
)


def get_htg_cli_path() -> str | None:
    """Return HTG CLI executable path or None if not available.

    Checks in order:
    1. Local checkout dist/src/cli.js (if exists and built)
    2. holdthegoblin on PATH
    3. htg on PATH
    """
    if HTG_CLI_LOCAL.exists():
        # Basic check: dist must have been built (cli.js exists)
        return f"node {HTG_CLI_LOCAL}"
    for name in ("holdthegoblin", "htg"):
        path = shutil.which(name)
        if path:
            return path
    return None


async def _run_htg(
    args: list[str],
    *,
    root: str | None = None,
    timeout: float = 15.0,
) -> subprocess.CompletedProcess[str]:
    """Run HTG CLI and return CompletedProcess.

    Args:
        args: HTG CLI arguments (e.g. ["doctor", "--root", "/path"])
        root: Optional project root to pass as --root
        timeout: Seconds before force-kill

    Returns:
        CompletedProcess with stdout/stderr decoded as text

    Raises:
        FileNotFoundError: HTG CLI not available
        asyncio.TimeoutExpired: Command timed out
    """
    cli = get_htg_cli_path()
    if not cli:
        raise FileNotFoundError("HoldTheGoblin not found")

    # Build command: node /path/to/cli.js doctor --root /project
    parts = cli.split()
    cmd_args = list(args)
    if root:
        cmd_args.extend(["--root", root])

    proc = await asyncio.create_subprocess_exec(
        *parts,
        *cmd_args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
    except TimeoutError:
        proc.kill()
        await proc.wait()
        raise subprocess.TimeoutExpired(
            parts[0] if parts else "node",
            timeout,
        ) from None

    return subprocess.CompletedProcess(
        args=parts + cmd_args,
        returncode=proc.returncode if proc.returncode is not None else -1,
        stdout=stdout_bytes.decode("utf-8", errors="replace"),
        stderr=stderr_bytes.decode("utf-8", errors="replace"),
    )


def _parse_json_safe(text: str) -> Any | None:
    """Parse JSON text, return None on failure."""
    try:
        return _json.loads(text)
    except Exception:
        return None


async def _call_htg_tool(
    tool: str,
    *,
    root: str | None = None,
    extra_args: list[str] | None = None,
    timeout: float = 15.0,
) -> dict[str, Any]:
    """Call a single HTG read-only tool, return structured result.

    Args:
        tool: HTG tool name (doctor, events, checkpoint_list, config_validate)
        root: Optional project root
        extra_args: Additional args to pass
        timeout: Seconds before force-kill

    Returns:
        dict with at least {"ok": bool} and optionally parsed JSON content
    """
    args = [tool]
    if extra_args:
        args.extend(extra_args)

    try:
        result = await _run_htg(args, root=root, timeout=timeout)
    except FileNotFoundError:
        return {"ok": False, "error": "HoldTheGoblin not available"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"{tool} timed out after {timeout}s"}

    if result.returncode != 0:
        # HTG writes errors to stderr; redact sensitive content
        err = result.stderr.strip()[:300] if result.stderr else "non-zero exit"
        return {"ok": False, "error": err}

    # Try to parse stdout as JSON for structured tools
    parsed = _parse_json_safe(result.stdout)
    if parsed is not None:
        return {"ok": True, "data": parsed}

    # Non-JSON output (text summary)
    return {"ok": True, "raw": result.stdout.strip()[:500]}


async def probe_htg_status(root: str | None = None) -> dict[str, Any]:
    """Probe HoldTheGoblin availability and read-only status.

    Calls only read-only/safe tools:
    - doctor: project detection, scanner config
    - events --limit 20: recent event log
    - checkpoint_list: existing checkpoints
    - config_validate: HTG config validation

    Args:
        root: Optional project root to pass to HTG tools

    Returns:
        Structured dict:
        {
          "available": bool,
          "reason": str | None,        # only if available=False
          "cli_path": str | None,
          "doctor": dict | None,
          "doctor_error": str | None,
          "events": list | None,
          "events_error": str | None,
          "checkpoints": list | None,
          "checkpoints_error": str | None,
          "config_valid": bool | None,
          "config_error": str | None,
        }
    """
    cli_path = get_htg_cli_path()

    if not cli_path:
        return {
            "available": False,
            "reason": "HoldTheGoblin not found (no local checkout, no PATH binary)",
            "cli_path": None,
            "doctor": None,
            "events": None,
            "checkpoints": None,
            "config_valid": None,
        }

    # Check if local checkout exists but not built
    def _local_htg_unavailable() -> bool:
        try:
            return HTG_CLI_LOCAL.exists() and not Path(HTG_LOCAL_CHECKOUT / "dist" / "src" / "cli.js").exists()
        except PermissionError:
            # CI runner may deny stat on the HTG binary path
            return True

    if _local_htg_unavailable():
        return {
            "available": False,
            "reason": _HTG_BUILD_REQUIRED,
            "cli_path": cli_path,
        }

    result: dict[str, Any] = {
        "available": True,
        "cli_path": cli_path,
        "root": root,
    }

    # doctor — project detection and scanner config
    doctor_result = await _call_htg_tool("doctor", root=root, timeout=10.0)
    if doctor_result.get("ok"):
        result["doctor"] = doctor_result.get("data")
    else:
        result["doctor_error"] = doctor_result.get("error")

    # events --limit 20 — recent event log (read-only)
    events_result = await _call_htg_tool(
        "events", root=root, extra_args=["--limit", "20"], timeout=10.0
    )
    if events_result.get("ok"):
        events_data = events_result.get("data")
        if isinstance(events_data, list):
            result["events"] = events_data
        elif isinstance(events_data, dict):
            result["events"] = events_data.get("events", events_data.get("items", []))
        else:
            result["events"] = []
    else:
        result["events_error"] = events_result.get("error")

    # checkpoint_list — existing checkpoints (read-only, no mutation)
    cp_result = await _call_htg_tool("checkpoint_list", root=root, timeout=10.0)
    if cp_result.get("ok"):
        cp_data = cp_result.get("data")
        if isinstance(cp_data, list):
            result["checkpoints"] = cp_data
        elif isinstance(cp_data, dict):
            result["checkpoints"] = cp_data.get("checkpoints", [])
        else:
            result["checkpoints"] = []
    else:
        result["checkpoints_error"] = cp_result.get("error")

    # config_validate — HTG config schema validation (read-only)
    cv_result = await _call_htg_tool("config_validate", root=root, timeout=10.0)
    if cv_result.get("ok"):
        cv_data = cv_result.get("data")
        if isinstance(cv_data, dict):
            result["config_valid"] = cv_data.get("ok", cv_data.get("valid", True))
            result["config_schema"] = cv_data.get("schema")
        else:
            result["config_valid"] = True
    else:
        result["config_error"] = cv_result.get("error")
        result["config_valid"] = False

    return result
