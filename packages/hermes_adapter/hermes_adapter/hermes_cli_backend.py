"""Local Hermes CLI backend.

This backend is the primary desktop-local integration path. It runs the
installed ``hermes`` command directly and uses local Hermes files for sessions,
logs, profiles, config, skills, models, and MCP inventory.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import re
import subprocess
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

# Shell metacharacters that could be exploited in SSH remote command injection.
# This validates HERMES_STUDIO_REMOTE_HERMES_BIN before it is embedded in an SSH command.
_SHELL_METACHAR_RE = re.compile(r"[;&|`$<>{}()\[\]!*?\"'\\ \t\n\r]")

from hermes_adapter._subprocess import (  # noqa: E402
    build_ssh_hermes_command,
    run_hermes,
    run_hermes_over_ssh,
    validate_remote_ssh_target,
)
from hermes_adapter.backend_config import get_cli_run_timeout_seconds  # noqa: E402
from hermes_adapter.hermes_backend import HermesBackend, _now_iso, _redact  # noqa: E402
from hermes_adapter.hermes_inventory_repository import HermesInventoryRepository  # noqa: E402
from hermes_adapter.studio_events import make_studio_event  # noqa: E402


def _event(
    event_type: str,
    payload: dict[str, Any],
    *,
    run_id: str | None = None,
    session_id: str | None = None,
    source: str = "adapter",
) -> dict[str, Any]:
    return make_studio_event(
        event_type,
        payload,
        source=source,  # type: ignore[arg-type]
        run_id=run_id,
        session_id=session_id,
    )


def _csv(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, list):
        items = [str(item).strip() for item in value if str(item).strip()]
        return ",".join(items) if items else None
    return None


class HermesCliBackend(HermesBackend):
    """Hermes backend that executes the local CLI instead of requiring gateway."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8642",
        api_key: str | None = None,
        *,
        remote_ssh_target: str | None = None,
        remote_hermes_bin: str = "hermes",
    ) -> None:
        super().__init__(base_url, api_key)
        self._active_cli_runs: dict[str, dict[str, Any]] = {}
        self._processes: dict[str, asyncio.subprocess.Process] = {}
        # Validate remote_ssh_target against shell metacharacters and format.
        # Raises ValueError if the target contains blocked characters or is malformed.
        if remote_ssh_target:
            remote_ssh_target = validate_remote_ssh_target(remote_ssh_target)
        self._remote_ssh_target = remote_ssh_target
        # Validate remote_hermes_bin to prevent shell injection via HERMES_STUDIO_REMOTE_HERMES_BIN
        if remote_ssh_target and _SHELL_METACHAR_RE.search(remote_hermes_bin):
            raise ValueError(
                f"HERMES_STUDIO_REMOTE_HERMES_BIN contains unsafe characters: {remote_hermes_bin!r}"
            )
        self._remote_hermes_bin = remote_hermes_bin
        self._capability_cache: dict[str, Any] | None = None

    @property
    def _transport_name(self) -> str:
        return "ssh" if self._remote_ssh_target else "local-cli"

    async def _cli_probe(self) -> tuple[bool, str | None]:
        def _run() -> subprocess.CompletedProcess[str]:
            # S603/S607: hermes_path resolved via shutil.which(); args are hardcoded literals
            return run_hermes(["--version"], timeout=10.0, check_returncode=None)  # noqa: S603, S607

        try:
            result = await asyncio.to_thread(_run)
        except FileNotFoundError:
            return False, "Hermes CLI not found on PATH"
        except subprocess.TimeoutExpired:
            return False, "Hermes CLI probe timed out"
        if result.returncode != 0:
            return False, _redact((result.stderr or result.stdout or "Hermes CLI probe failed").strip())
        return True, result.stdout.strip().splitlines()[0] if result.stdout.strip() else "Hermes CLI available"

    async def _cli_capture(self, args: list[str], *, timeout: int = 10) -> subprocess.CompletedProcess[str]:
        def _run() -> subprocess.CompletedProcess[str]:
            if self._remote_ssh_target:
                # S603/S607: ssh resolved via shutil.which(); remote_target validated by regex in run_hermes_over_ssh; remote_bin validated at construction
                return run_hermes_over_ssh(self._remote_ssh_target, self._remote_hermes_bin, args, timeout=float(timeout))  # noqa: S603, S607
            # S603/S607: hermes_path resolved via shutil.which(); args are hardcoded/internal literals
            return run_hermes(args, timeout=float(timeout), check_returncode=None)  # noqa: S603, S607

        return await asyncio.to_thread(_run)

    async def cli_capabilities(self) -> dict[str, Any]:
        """Return local Hermes CLI command/flag discovery.

        The Studio should follow the installed Hermes version instead of a
        frozen copy of its capabilities. Help output is stable enough for
        feature gating, and failures degrade to a small unavailable payload.
        """
        if self._capability_cache is not None:
            return self._capability_cache

        available, version = await self._cli_probe()
        payload: dict[str, Any] = {
            "available": available,
            "transport": self._transport_name,
            "version": version,
            "commands": {},
            "chat_flags": {},
        }
        if not available:
            self._capability_cache = payload
            return payload

        try:
            root_help = await self._cli_capture(["--help"])
            chat_help = await self._cli_capture(["chat", "--help"])
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            payload["available"] = False
            payload["error"] = str(exc)
            self._capability_cache = payload
            return payload

        root_text = f"{root_help.stdout}\n{root_help.stderr}"
        chat_text = f"{chat_help.stdout}\n{chat_help.stderr}"
        command_names = [
            "chat",
            "model",
            "fallback",
            "gateway",
            "kanban",
            "skills",
            "tools",
            "mcp",
            "sessions",
            "checkpoints",
            "dashboard",
            "acp",
            "profile",
            "logs",
            "update",
        ]
        flag_names = [
            "--image",
            "--provider",
            "--model",
            "--toolsets",
            "--skills",
            "--resume",
            "--continue",
            "--worktree",
            "--accept-hooks",
            "--checkpoints",
            "--max-turns",
            "--yolo",
            "--pass-session-id",
            "--ignore-user-config",
            "--ignore-rules",
            "--source",
        ]
        payload["commands"] = {name: name in root_text for name in command_names}
        payload["chat_flags"] = {name.lstrip("-").replace("-", "_"): name in chat_text for name in flag_names}
        self._capability_cache = payload
        return payload

    async def health(self) -> dict[str, Any]:
        available, detail = await self._cli_probe()
        log_status = self._log_repo.get_status() if self._log_repo else {"available": False, "reason": "No logs directory found"}
        profile_status = self._profile_repo.get_status() if self._profile_repo else {"available": False, "reason": "No profiles found"}
        return {
            "status": "healthy" if available else "degraded",
            "adapter_version": "0.1.0",
            "hermes_connected": available,
            "uptime_seconds": 0,
            "backend_mode": self._transport_name,
            "hermes_transport": self._transport_name,
            "hermes_cli": detail,
            "cli_capabilities": await self.cli_capabilities(),
            "hermes_last_error": None if available else detail,
            "logs": log_status,
            "profiles": profile_status,
        }

    async def bootstrap(self) -> dict[str, Any]:
        available, detail = await self._cli_probe()
        recent_sessions: list[dict[str, Any]] = []
        session_status: dict[str, Any] = {"source": "unavailable", "available": False}
        if self._session_repo:
            session_status = self._session_repo.get_status()
            if self._session_repo.available:
                session_data = self._session_repo.list_sessions(limit=5)
                recent_sessions = session_data.get("sessions", [])

        active_profile = self._profile_repo.active_profile if self._profile_repo else None
        profile_status = self._profile_repo.get_status() if self._profile_repo else {"available": False}
        log_status = self._log_repo.get_status() if self._log_repo else {"available": False}
        model_config = await self.get_model_config()
        display_config = self._config_repo.get_display_config() if self._config_repo else {"language": "en"}

        try:
            available_models = HermesInventoryRepository(self._hermes_home).list_models()
        except Exception:
            available_models = []

        return {
            "adapter_version": "0.1.0",
            "hermes_version": detail or "unknown",
            "active_profile": active_profile,
            "capabilities": ["local_cli", "oneshot", "tools", "skills", "sessions", "logs", "config_cli"],
            "cli_capabilities": await self.cli_capabilities(),
            "recent_sessions": recent_sessions,
            "active_theme": None,
            "available_models": available_models,
            "session_source": session_status,
            "profiles_available": profile_status.get("available", False),
            "profile_count": profile_status.get("profile_count", 0),
            "logs_available": log_status.get("available", False),
            "log_sources": log_status.get("log_files", []),
            "model_config": {
                "provider": model_config.get("provider", "unknown"),
                "model": model_config.get("model", "unknown"),
                "api_key_configured": model_config.get("api_key_configured", False),
                "config_source": model_config.get("config_source", "unavailable"),
            },
            "display": display_config,
            "cli_available": available,
        }

    async def start_run(
        self,
        session_id: str,
        prompt: str,
        profile: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not prompt.strip():
            return {"run_id": "", "status": "failed", "error": "Prompt is required"}
        available, detail = await self._cli_probe()
        if not available:
            return {"run_id": "", "status": "failed", "error": detail or "Hermes CLI unavailable"}

        run_id = f"run_{uuid.uuid4().hex[:12]}"
        self._active_cli_runs[run_id] = {
            "run_id": run_id,
            "session_id": session_id,
            "prompt": prompt,
            "profile": profile,
            "context": context or {},
            "status": "started",
        }
        return {"run_id": run_id, "status": "started", "transport": self._transport_name}

    async def stream_run_events(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
        run = self._active_cli_runs.get(run_id)
        if not run:
            yield _event("run.failed", {"run_id": run_id, "message": f"Run '{run_id}' not found"}, run_id=run_id)
            return

        session_id = str(run.get("session_id") or "")
        yield _event(
            "run.started",
            {"run_id": run_id, "session_id": session_id, "transport": self._transport_name},
            run_id=run_id,
            session_id=session_id,
        )
        yield _event(
            "adapter.warning",
            {
                "code": "local_cli_transport",
                "message": (
                    "Running through Hermes CLI. Studio streams CLI output locally; "
                    "structured tool/approval telemetry remains available through optional gateway/API mode."
                ),
            },
            run_id=run_id,
            session_id=session_id,
        )

        command = self._command_for_run(run)
        cwd = self._cwd_for_run(run)
        timeout = get_cli_run_timeout_seconds()
        ping_interval = 30.0
        inactivity_timeout = 60.0
        # Per-call readline timeout to prevent indefinite blocking on a single syscall.
        # This is independent of the inactivity timeout and caps how long any single
        # readline() call can block even when data is potentially trickling in slowly.
        per_call_timeout = 10.0
        last_event_time = asyncio.get_running_loop().time()
        next_ping_at = last_event_time + ping_interval
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd) if cwd else None,
            env=self._cli_env(),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._processes[run_id] = process
        stderr_task: asyncio.Task[bytes] | None = None
        try:
            stderr_task = asyncio.create_task(process.stderr.read() if process.stderr else asyncio.sleep(0, result=b""))
            deadline = asyncio.get_running_loop().time() + timeout
            if process.stdout:
                while True:
                    now = asyncio.get_running_loop().time()
                    # Check inactivity timeout before waiting for next chunk
                    if now - last_event_time > inactivity_timeout:
                        process.kill()
                        yield _event(
                            "run.disconnected",
                            {"run_id": run_id, "reason": "inactivity_timeout", "message": "No output received for too long"},
                            run_id=run_id,
                            session_id=session_id,
                        )
                        return
                    remaining = deadline - now
                    wait_timeout = min(remaining, next_ping_at - now) if next_ping_at > now else remaining
                    if wait_timeout <= 0:
                        wait_timeout = remaining
                    # Cap per-call timeout to prevent a single readline() from blocking
                    # indefinitely even if data trickles in slowly.
                    call_timeout = min(wait_timeout, per_call_timeout) if per_call_timeout > 0 else wait_timeout
                    try:
                        chunk = await asyncio.wait_for(process.stdout.readline(), timeout=call_timeout)
                    except TimeoutError:
                        # Timeout on wait — check if it's a ping or inactivity timeout
                        now2 = asyncio.get_running_loop().time()
                        if next_ping_at <= now2:
                            yield _event(
                                "ping",
                                {"run_id": run_id, "timestamp": _now_iso()},
                                run_id=run_id,
                                session_id=session_id,
                            )
                            next_ping_at = now2 + ping_interval
                            last_event_time = now2
                        if now2 - last_event_time > inactivity_timeout:
                            process.kill()
                            yield _event(
                                "run.disconnected",
                                {"run_id": run_id, "reason": "inactivity_timeout", "message": "No output received for too long"},
                                run_id=run_id,
                                session_id=session_id,
                            )
                            return
                        continue
                    if not chunk:
                        break
                    last_event_time = asyncio.get_running_loop().time()
                    next_ping_at = last_event_time + ping_interval
                    text = chunk.decode("utf-8", errors="replace")
                    if text:
                        yield _event("assistant.delta", {"text": text}, run_id=run_id, session_id=session_id, source="hermes")
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise TimeoutError
            await asyncio.wait_for(process.wait(), timeout=remaining)
            stderr = await stderr_task
        except TimeoutError:
            process.kill()
            await process.wait()
            if stderr_task and not stderr_task.done():
                stderr_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await stderr_task
            yield _event("run.failed", {"run_id": run_id, "message": "Hermes CLI run timed out"}, run_id=run_id, session_id=session_id)
            return
        except asyncio.CancelledError:
            # Clean up stderr_task on cancellation before re-raising
            if stderr_task and not stderr_task.done():
                stderr_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await stderr_task
            raise
        finally:
            self._processes.pop(run_id, None)
            self._active_cli_runs.pop(run_id, None)
            if stderr_task and not stderr_task.done():
                stderr_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await stderr_task

        error = stderr.decode("utf-8", errors="replace").strip()
        if process.returncode != 0:
            yield _event(
                "run.failed",
                {"run_id": run_id, "message": _redact(error or f"Hermes CLI exited with {process.returncode}")},
                run_id=run_id,
                session_id=session_id,
            )
            return

        if error:
            yield _event(
                "adapter.warning",
                {"code": "hermes_cli_stderr", "message": _redact(error[:2000])},
                run_id=run_id,
                session_id=session_id,
            )
        yield _event("assistant.completed", {"model": run.get("context", {}).get("model")}, run_id=run_id, session_id=session_id, source="hermes")
        yield _event("run.completed", {"run_id": run_id, "transport": self._transport_name}, run_id=run_id, session_id=session_id)

    async def stop_run(self, run_id: str) -> dict[str, Any]:
        process = self._processes.get(run_id)
        if process and process.returncode is None:
            process.terminate()
            return {"run_id": run_id, "status": "stopping"}
        if run_id in self._active_cli_runs:
            self._active_cli_runs.pop(run_id, None)
            return {"run_id": run_id, "status": "cancelled"}
        return {"run_id": run_id, "status": "not_found"}

    def _cli_env(self) -> dict[str, str]:
        env = {**os.environ, "HERMES_HOME": str(self._hermes_home)}
        env.setdefault("HERMES_ACCEPT_HOOKS", "1")
        return env

    def _base_cli_command(self, args: list[str]) -> list[str]:
        if self._remote_ssh_target:
            # Use centralized builder for consistent security properties:
            # ssh resolved via which(); target validated by regex; bin validated
            # by _SHELL_METACHAR_RE; args via shlex.quote(); timeout set by caller.
            # noqa: S603, S607  # builder validates target/bin; ssh resolved via which(); list-arg dispatch
            return build_ssh_hermes_command(
                self._remote_ssh_target, self._remote_hermes_bin, args
            )
        return ["hermes", *args]

    def _command_for_run(self, run: dict[str, Any]) -> list[str]:
        raw_context = run.get("context")
        context: dict[str, Any] = raw_context if isinstance(raw_context, dict) else {}
        prompt = str(run.get("prompt") or "")
        args = ["chat", "--query", prompt, "--quiet", "--source", "desktop-studio", "--accept-hooks"]
        provider = context.get("provider")
        model = context.get("model")
        toolsets = _csv(context.get("toolsets"))
        skills = _csv(context.get("skills"))
        max_turns = context.get("max_turns")
        if isinstance(provider, str) and provider:
            args.extend(["--provider", provider])
        if isinstance(model, str) and model:
            args.extend(["--model", model])
        if toolsets:
            args.extend(["--toolsets", toolsets])
        if skills:
            args.extend(["--skills", skills])
        if isinstance(max_turns, int) and max_turns > 0:
            args.extend(["--max-turns", str(max_turns)])
        if context.get("checkpoints") is True:
            args.append("--checkpoints")
        if context.get("worktree") is True:
            args.append("--worktree")
        if context.get("pass_session_id") is True:
            args.append("--pass-session-id")
        if context.get("ignore_user_config") is True:
            args.append("--ignore-user-config")
        if context.get("ignore_rules") is True:
            args.append("--ignore-rules")
        if context.get("yolo") is True:
            args.append("--yolo")
        continue_session = context.get("continue_session")
        if isinstance(continue_session, str) and continue_session.strip():
            args.extend(["--continue", continue_session.strip()])
            return self._base_cli_command(args)
        if continue_session is True:
            args.append("--continue")
            return self._base_cli_command(args)
        session_id = str(run.get("session_id") or "")
        if session_id and session_id not in {"default", "new"}:
            args.extend(["--resume", session_id])
        return self._base_cli_command(args)

    def _cwd_for_run(self, run: dict[str, Any]) -> Path | None:
        if self._remote_ssh_target:
            return None
        raw_context = run.get("context")
        context: dict[str, Any] = raw_context if isinstance(raw_context, dict) else {}
        workspace = context.get("workspace_path")
        if not isinstance(workspace, str) or not workspace:
            return None
        path = Path(workspace).expanduser()
        return path if path.is_dir() else None
