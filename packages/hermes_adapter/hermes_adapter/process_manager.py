"""Process manager for managing local development processes.

Manages subprocess lifecycle, captures stdout/stderr, tracks PID/status/start time.
Only predefined process types are allowed — no arbitrary shell commands.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import signal
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

logger = logging.getLogger(__name__)

MAX_LOG_LINES = 2000
_ENV_NAME_RE = re.compile(r"^[A-Z_][A-Z0-9_]*$")
_MAX_ENV_VALUE_LENGTH = 4096
_SSH_TARGET_RE = re.compile(r"^[A-Za-z0-9_.@:%-]+$")
_ALLOWED_ENV_OVERRIDES: dict[str, set[str]] = {
    "hermes-remote-ssh-check": {"HERMES_STUDIO_REMOTE_SSH_TARGET"},
    "hermes-gateway": {"API_SERVER_PORT"},
}


class ProcessStatus(StrEnum):
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"
    STARTING = "starting"


@dataclass
class ProcessTemplate:
    """Predefined process template."""
    name: str
    command: str
    description: str
    category: str = "studio"
    cwd: str | None = None
    env: dict[str, str] = field(default_factory=dict)


# Predefined templates — only these are allowed
TEMPLATES: dict[str, ProcessTemplate] = {
    "dev-server": ProcessTemplate(
        name="Hermes Dev Server",
        command="pnpm run dev:desktop",
        description="Starts the Hermes Desktop Studio Vite dev server",
    ),
    "adapter": ProcessTemplate(
        name="Python Adapter",
        command="pnpm run dev:adapter",
        description="Starts the Python adapter in dev mode",
    ),
    "test-runner": ProcessTemplate(
        name="Test Runner",
        command="pnpm --filter @hermes-desktop-studio/desktop-studio test:e2e",
        description="Runs end-to-end tests",
    ),
    "build": ProcessTemplate(
        name="Build",
        command="pnpm run build",
        description="Runs the production build",
    ),
    "hermes-gateway": ProcessTemplate(
        name="Hermes Gateway Bridge",
        command="hermes gateway --accept-hooks run",
        description="Runs the optional Hermes messaging/API bridge for remote or rich event workflows",
        category="hermes",
        env={
            "API_SERVER_ENABLED": "true",
            "API_SERVER_HOST": "127.0.0.1",
            "API_SERVER_PORT": "8642",
        },
    ),
    "hermes-remote-ssh-check": ProcessTemplate(
        name="Remote Hermes SSH Check",
        command="ssh $HERMES_STUDIO_REMOTE_SSH_TARGET 'hermes --version && hermes status'",
        description="Checks a remote VPS Hermes install for SSH-backed Studio mode",
        category="hermes",
    ),
    "hermes-doctor": ProcessTemplate(
        name="Hermes Doctor",
        command="hermes doctor",
        description="Checks the local Hermes installation and dependencies",
        category="hermes",
    ),
    "hermes-tools-summary": ProcessTemplate(
        name="Hermes Tools Summary",
        command="hermes tools --summary list",
        description="Prints enabled Hermes toolsets and MCP tools",
        category="hermes",
    ),
    "hermes-mcp-list": ProcessTemplate(
        name="Hermes MCP List",
        command="hermes mcp list",
        description="Lists configured Hermes MCP servers",
        category="hermes",
    ),
    "hermes-skills-check": ProcessTemplate(
        name="Hermes Skills Check",
        command="hermes skills check",
        description="Checks installed Hermes skills for updates",
        category="hermes",
    ),
    "hermes-checkpoints-status": ProcessTemplate(
        name="Hermes Checkpoints Status",
        command="hermes checkpoints status",
        description="Shows Hermes v0.13 checkpoint store size and project coverage",
        category="hermes",
    ),
    "hermes-kanban-stats": ProcessTemplate(
        name="Hermes Kanban Stats",
        command="hermes kanban stats",
        description="Shows Hermes Kanban task counts for multi-agent workflows",
        category="hermes",
    ),
    "hermes-kanban-watch": ProcessTemplate(
        name="Hermes Kanban Watch",
        command="hermes kanban watch",
        description="Watches Hermes Kanban task events for agent orchestration",
        category="hermes",
    ),
}


@dataclass
class ManagedProcess:
    """A managed subprocess."""
    id: str
    template_id: str
    name: str
    command: str
    status: ProcessStatus
    pid: int | None
    started_at: str
    stopped_at: str | None
    exit_code: int | None
    logs: deque[str] = field(default_factory=lambda: deque(maxlen=MAX_LOG_LINES))
    error: str | None = None
    _process: asyncio.subprocess.Process | None = field(default=None, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)
    _output_task: asyncio.Task | None = field(default=None, repr=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "template_id": self.template_id,
            "name": self.name,
            "command": self.command,
            "status": self.status.value,
            "pid": self.pid,
            "started_at": self.started_at,
            "stopped_at": self.stopped_at,
            "exit_code": self.exit_code,
            "log_count": len(self.logs),
            "error": self.error,
        }


class ProcessManager:
    """Manages subprocess lifecycle for predefined process types."""

    def __init__(self) -> None:
        self._processes: dict[str, ManagedProcess] = {}

    def list_processes(self) -> list[dict[str, Any]]:
        return [p.to_dict() for p in self._processes.values()]

    def get_process(self, process_id: str) -> ManagedProcess | None:
        return self._processes.get(process_id)

    def get_process_dict(self, process_id: str) -> dict[str, Any] | None:
        proc = self._processes.get(process_id)
        return proc.to_dict() if proc else None

    def list_templates(self) -> list[dict[str, str]]:
        return [
            {
                "id": tid,
                "name": t.name,
                "command": t.command,
                "description": t.description,
                "category": t.category,
            }
            for tid, t in TEMPLATES.items()
        ]

    def _validate_env_overrides(
        self,
        template_id: str,
        env_overrides: dict[str, str] | None,
    ) -> dict[str, str]:
        if env_overrides is None:
            return {}
        if not isinstance(env_overrides, dict):
            raise ValueError("Environment overrides must be an object")

        allowed = _ALLOWED_ENV_OVERRIDES.get(template_id, set())
        validated: dict[str, str] = {}
        for key, value in env_overrides.items():
            if not isinstance(key, str) or not _ENV_NAME_RE.fullmatch(key):
                raise ValueError(f"Invalid environment override name: {key!r}")
            if key not in allowed:
                raise ValueError(f"Environment override is not allowed for template '{template_id}': {key}")
            if not isinstance(value, str):
                raise ValueError(f"Environment override '{key}' must be a string")
            if "\x00" in value:
                raise ValueError(f"Environment override '{key}' contains an invalid NUL byte")
            if len(value) > _MAX_ENV_VALUE_LENGTH:
                raise ValueError(f"Environment override '{key}' is too long")
            if key == "API_SERVER_PORT":
                try:
                    port = int(value)
                except ValueError as exc:
                    raise ValueError("API_SERVER_PORT must be an integer") from exc
                if port < 1 or port > 65535:
                    raise ValueError("API_SERVER_PORT must be between 1 and 65535")
            if key == "HERMES_STUDIO_REMOTE_SSH_TARGET" and not _SSH_TARGET_RE.fullmatch(value):
                raise ValueError("HERMES_STUDIO_REMOTE_SSH_TARGET contains unsafe characters")
            validated[key] = value
        return validated

    def _resolve_workdir(self, cwd: str | None, template: ProcessTemplate) -> str:
        if cwd is not None and not isinstance(cwd, str):
            raise ValueError("Working directory must be a string")
        if cwd is not None and "\x00" in cwd:
            raise ValueError("Working directory contains an invalid NUL byte")

        base_dir = os.path.realpath(os.getcwd())
        requested = cwd or template.cwd or base_dir
        if not isinstance(requested, str):
            raise ValueError("Working directory must be a string")

        if os.path.isabs(requested):
            workdir = os.path.realpath(requested)
        else:
            workdir = os.path.realpath(os.path.join(base_dir, requested))

        # Verify the path is a real directory and resolve any symlinks to
        # prevent TOCTOU races: check with lstat (to detect symlinks) then
        # follow and verify the target, using O_NOFOLLOW to avoid following
        # symlinks during the open check.
        try:
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_DIRECTORY
            fd = os.open(workdir, flags)
            os.close(fd)
        except (OSError, ValueError) as err:
            raise ValueError(f"Working directory does not exist or is not a safe directory: {requested}") from err
        if os.path.commonpath([base_dir, workdir]) != base_dir:
            raise ValueError(f"Working directory is outside the adapter workspace: {requested}")
        return workdir

    async def start_process(
        self,
        template_id: str,
        *,
        cwd: str | None = None,
        env_overrides: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        if template_id not in TEMPLATES:
            raise ValueError(
                f"Unknown process template '{template_id}'. "
                f"Available: {', '.join(TEMPLATES.keys())}"
            )

        template = TEMPLATES[template_id]
        process_id = uuid.uuid4().hex[:12]
        started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        validated_env_overrides = self._validate_env_overrides(template_id, env_overrides)

        proc = ManagedProcess(
            id=process_id,
            template_id=template_id,
            name=template.name,
            command=template.command,
            status=ProcessStatus.STARTING,
            pid=None,
            started_at=started_at,
            stopped_at=None,
            exit_code=None,
        )
        self._processes[process_id] = proc

        try:
            workdir = self._resolve_workdir(cwd, template)
        except ValueError as exc:
            proc.status = ProcessStatus.ERROR
            proc.error = str(exc)
            proc.stopped_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            raise

        env = {**os.environ, **template.env, **validated_env_overrides}

        try:
            process = await asyncio.create_subprocess_shell(
                template.command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=workdir,
                env=env,
                preexec_fn=os.setsid if os.name != "nt" else None,
            )
            proc._process = process
            proc.pid = process.pid
            proc.status = ProcessStatus.RUNNING
            proc.logs.append(f"[{started_at}] Process started: {template.command}")
            proc.logs.append(f"[{started_at}] PID: {process.pid}")

            proc._output_task = asyncio.create_task(self._stream_output(proc))
        except Exception as exc:
            proc.status = ProcessStatus.ERROR
            proc.error = str(exc)
            proc.stopped_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            logger.error("Failed to start process %s: %s", template_id, exc)
            raise

        return proc.to_dict()

    async def stop_process(self, process_id: str) -> dict[str, Any]:
        proc = self._processes.get(process_id)
        if not proc:
            raise ValueError(f"Process '{process_id}' not found")

        if proc.status != ProcessStatus.RUNNING:
            raise ValueError(f"Process '{process_id}' is not running (status: {proc.status.value})")

        if proc._process and proc._process.returncode is None:
            try:
                if os.name != "nt":
                    os.killpg(os.getpgid(proc._process.pid), signal.SIGTERM)
                else:
                    proc._process.terminate()
                try:
                    await asyncio.wait_for(proc._process.wait(), timeout=5.0)
                except TimeoutError:
                    if os.name != "nt":
                        os.killpg(os.getpgid(proc._process.pid), signal.SIGKILL)
                    else:
                        proc._process.kill()
                    await proc._process.wait()
            except ProcessLookupError:
                pass

        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        async with proc._lock:
            proc.status = ProcessStatus.STOPPED
            proc.stopped_at = now
            proc.exit_code = proc._process.returncode if proc._process else None
            proc.logs.append(f"[{now}] Process stopped by user")
        return proc.to_dict()

    def get_logs(
        self,
        process_id: str,
        tail: int = 200,
    ) -> dict[str, Any]:
        proc = self._processes.get(process_id)
        if not proc:
            raise ValueError(f"Process '{process_id}' not found")

        lines = list(proc.logs)[-tail:]
        return {
            "process_id": process_id,
            "lines": lines,
            "total": len(proc.logs),
        }

    async def _stream_output(self, proc: ManagedProcess) -> None:
        if not proc._process or not proc._process.stdout:
            return
        try:
            async for raw_line in proc._process.stdout:
                line = raw_line.decode("utf-8", errors="replace").rstrip("\n")
                timestamp = time.strftime("%H:%M:%S", time.gmtime())
                proc.logs.append(f"[{timestamp}] {line}")
        except Exception as exc:
            logger.debug("Output stream error for %s: %s", proc.id, exc)

        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        async with proc._lock:
            if proc._process.returncode is not None:
                proc.exit_code = proc._process.returncode
                if proc.status in (ProcessStatus.STOPPED, ProcessStatus.ERROR):
                    return
                if proc._process.returncode == 0:
                    proc.status = ProcessStatus.STOPPED
                    proc.logs.append(f"[{now}] Process exited normally (code 0)")
                else:
                    proc.status = ProcessStatus.ERROR
                    proc.error = f"Exit code: {proc._process.returncode}"
                    proc.logs.append(f"[{now}] Process exited with code {proc._process.returncode}")
                proc.stopped_at = now

    def remove_process(self, process_id: str) -> bool:
        if process_id not in self._processes:
            return False
        proc = self._processes[process_id]
        if proc.status == ProcessStatus.RUNNING:
            raise ValueError("Cannot remove a running process. Stop it first.")
        # Cancel the orphan stdout/stderr stream task before removing
        if proc._output_task is not None and not proc._output_task.done():
            proc._output_task.cancel()
        del self._processes[process_id]
        return True


_manager: ProcessManager | None = None


def get_process_manager() -> ProcessManager:
    global _manager
    if _manager is None:
        _manager = ProcessManager()
    return _manager
