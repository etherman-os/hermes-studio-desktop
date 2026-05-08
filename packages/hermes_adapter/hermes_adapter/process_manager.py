"""Process manager for managing local development processes.

Manages subprocess lifecycle, captures stdout/stderr, tracks PID/status/start time.
Only predefined process types are allowed — no arbitrary shell commands.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

logger = logging.getLogger(__name__)

MAX_LOG_LINES = 2000


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
            }
            for tid, t in TEMPLATES.items()
        ]

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

        env = {**os.environ, **template.env}
        if env_overrides:
            env.update(env_overrides)

        workdir = cwd or template.cwd or os.getcwd()

        if not os.path.isdir(workdir):
            proc.status = ProcessStatus.ERROR
            proc.error = f"Working directory does not exist: {workdir}"
            proc.stopped_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            raise ValueError(f"Working directory does not exist or is not a directory: {workdir}")

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

            asyncio.create_task(self._stream_output(proc))
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
        del self._processes[process_id]
        return True


_manager: ProcessManager | None = None


def get_process_manager() -> ProcessManager:
    global _manager
    if _manager is None:
        _manager = ProcessManager()
    return _manager
