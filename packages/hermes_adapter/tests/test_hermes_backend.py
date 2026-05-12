"""Tests for HermesBackend — real Hermes API integration."""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from hermes_adapter.hermes_backend import HermesBackend, _normalize_hermes_event
from hermes_adapter.hermes_cli_backend import HermesCliBackend

# ---------------------------------------------------------------------------
# Fake Hermes API server for testing
# ---------------------------------------------------------------------------


def _create_fake_hermes_app(healthy: bool = True) -> FastAPI:
    """Create a fake Hermes API server for testing."""
    app = FastAPI()
    _runs: dict[str, dict[str, Any]] = {}
    app.state.last_run_body = None

    @app.get("/health")
    async def health():
        if healthy:
            return {"status": "ok", "platform": "hermes-agent"}
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="unavailable")

    @app.get("/v1/capabilities")
    async def capabilities():
        return {
            "object": "hermes.api_server.capabilities",
            "platform": "hermes-agent",
            "model": "hermes-agent",
            "auth": {"type": "bearer", "required": False},
            "features": {
                "run_submission": True,
                "run_events_sse": True,
                "run_stop": True,
            },
            "endpoints": {
                "runs": {"method": "POST", "path": "/v1/runs"},
                "run_events": {"method": "GET", "path": "/v1/runs/{run_id}/events"},
            },
        }

    @app.post("/v1/runs")
    async def start_run(body: dict[str, Any]):
        from fastapi import HTTPException

        app.state.last_run_body = body
        if "input" not in body:
            raise HTTPException(
                status_code=400,
                detail={"error": {"message": "Missing 'input' field", "type": "invalid_request_error"}},
            )
        import uuid
        run_id = f"run_{uuid.uuid4().hex[:8]}"
        _runs[run_id] = {"run_id": run_id, "status": "started", "session_id": body.get("session_id", "")}
        return {"run_id": run_id, "status": "started"}

    @app.get("/v1/runs/{run_id}/events")
    async def stream_events(run_id: str):
        async def generate():
            # Simulate the verified Hermes API server SSE stream shape.
            chunks = [
                {"event": "message.delta", "run_id": run_id, "timestamp": 1778105767.0, "delta": "Hello "},
                {"event": "message.delta", "run_id": run_id, "timestamp": 1778105767.1, "delta": "world!"},
                {"event": "run.completed", "run_id": run_id, "timestamp": 1778105767.2, "output": "Hello world!"},
            ]
            for chunk in chunks:
                yield f"data: {json.dumps(chunk)}\n\n"
                await asyncio.sleep(0.05)

        return StreamingResponse(generate(), media_type="text/event-stream")

    @app.post("/v1/runs/{run_id}/stop")
    async def stop_run(run_id: str):
        return {"run_id": run_id, "status": "stopping"}

    return app


# ---------------------------------------------------------------------------
# Event normalization tests
# ---------------------------------------------------------------------------


class TestNormalizeHermesEvent:
    def test_openai_delta_format(self):
        raw = {"choices": [{"delta": {"content": "Hello "}}]}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "assistant.delta"
        assert result["payload"]["text"] == "Hello "

    def test_hermes_run_started(self):
        raw = {"type": "run.started", "payload": {"run_id": "r1", "session_id": "s1"}}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "run.started"
        assert result["payload"]["run_id"] == "r1"

    def test_real_api_message_delta_event_field(self):
        raw = {"event": "message.delta", "run_id": "r1", "timestamp": 1778105767.0, "delta": "Hello"}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "assistant.delta"
        assert result["run_id"] == "r1"
        assert result["payload"]["text"] == "Hello"

    def test_real_api_tool_completed_error_flag(self):
        raw = {"event": "tool.completed", "run_id": "r1", "tool": "bash", "duration": 0.25, "error": False}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "tool.completed"
        assert result["payload"]["success"] is True
        assert result["payload"]["duration_ms"] == 250

    def test_hermes_tool_started(self):
        raw = {"type": "tool.started", "payload": {"tool": "bash", "tool_call_id": "tc1"}}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "tool.started"
        assert result["payload"]["tool"] == "bash"

    def test_hermes_tool_completed(self):
        raw = {"type": "tool.completed", "payload": {"tool": "bash", "success": True}}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "tool.completed"
        assert result["payload"]["success"] is True

    def test_hermes_run_completed(self):
        raw = {"type": "run.completed", "payload": {"run_id": "r1"}}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "run.completed"

    def test_hermes_run_completed_failure_becomes_run_failed(self):
        raw = {"type": "run.completed", "payload": {"run_id": "r1", "status": "failed", "error": "timeout"}}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "run.failed"
        assert result["payload"]["message"] == "timeout"

    def test_unknown_event_becomes_adapter_warning(self):
        raw = {"type": "some.future.event", "payload": {"data": "value"}}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "adapter.warning"
        assert "some.future.event" in result["payload"]["message"]

    def test_empty_event_becomes_adapter_warning(self):
        raw = {}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "adapter.warning"


# ---------------------------------------------------------------------------
# HermesBackend tests with fake server
# ---------------------------------------------------------------------------


class TestHermesBackend:
    @pytest.fixture()
    def fake_hermes(self):
        """Start a fake Hermes server and return its URL."""
        import socket
        import threading

        import uvicorn

        # Find a free port
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]

        app = _create_fake_hermes_app(healthy=True)

        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        import time
        time.sleep(0.5)

        yield f"http://127.0.0.1:{port}"
        server.should_exit = True

    @pytest.fixture()
    def fake_hermes_unavailable(self):
        """Return URL of a non-existent Hermes server."""
        return "http://127.0.0.1:19999"

    async def test_health_success(self, fake_hermes):
        backend = HermesBackend(fake_hermes)
        health = await backend.health()
        assert health["hermes_connected"] is True
        assert health["backend_mode"] == "hermes"
        if hasattr(backend, "close"):
            await backend.close()  # type: ignore[attr-defined]

    async def test_health_unavailable(self, fake_hermes_unavailable):
        backend = HermesBackend(fake_hermes_unavailable)
        health = await backend.health()
        assert health["hermes_connected"] is False
        assert health["status"] == "degraded"
        assert health["hermes_last_error"] is not None
        await backend.close()

    async def test_bootstrap_with_hermes(self, fake_hermes):
        backend = HermesBackend(fake_hermes)
        data = await backend.bootstrap()
        assert "adapter_version" in data
        assert "capabilities" in data
        assert "run_submission" in data["capabilities"]
        await backend.close()

    async def test_start_run(self, fake_hermes):
        backend = HermesBackend(fake_hermes)
        result = await backend.start_run("s-1", "hello")
        assert result["status"] == "started"
        assert "run_id" in result
        await backend.close()

    async def test_start_run_uses_verified_input_payload(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/health":
                return httpx.Response(200, json={"status": "ok", "platform": "hermes-agent"})
            assert request.url.path == "/v1/runs"
            body = json.loads(request.content.decode("utf-8"))
            assert body == {"session_id": "s-1", "input": "hello", "profile": "ignored"}
            return httpx.Response(202, json={"run_id": "run-1", "status": "started"})

        backend = HermesBackend("http://hermes.test")
        await backend._client.aclose()
        backend._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

        result = await backend.start_run("s-1", "hello", profile="ignored")

        await backend.close()
        assert result == {"run_id": "run-1", "status": "started"}

    async def test_start_run_forwards_extended_studio_options_to_gateway(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/health":
                return httpx.Response(200, json={"status": "ok", "platform": "hermes-agent"})
            assert request.url.path == "/v1/runs"
            body = json.loads(request.content.decode("utf-8"))
            assert body == {
                "session_id": "s-1",
                "input": "hello",
                "provider": "glm",
                "model": "glm-5",
                "skills": ["design"],
                "toolsets": ["file", "browser"],
                "checkpoints": True,
                "max_turns": 42,
                "worktree": True,
                "pass_session_id": True,
                "ignore_rules": True,
                "ignore_user_config": True,
                "linked_card_id": "card-1",
            }
            return httpx.Response(202, json={"run_id": "run-1", "status": "started"})

        backend = HermesBackend("http://hermes.test")
        await backend._client.aclose()
        backend._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

        result = await backend.start_run(
            "s-1",
            "hello",
            context={
                "provider": "glm",
                "model": "glm-5",
                "skills": ["design"],
                "toolsets": ["file", "browser"],
                "checkpoints": True,
                "max_turns": 42,
                "worktree": True,
                "pass_session_id": True,
                "ignore_rules": True,
                "ignore_user_config": True,
                "linked_card_id": "card-1",
            },
        )

        await backend.close()
        assert result == {"run_id": "run-1", "status": "started"}

    async def test_patch_model_config_uses_hermes_cli(self, tmp_path, monkeypatch):
        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        fake_hermes = bin_dir / "hermes"
        fake_hermes.write_text(
            """#!/usr/bin/env bash
set -eu
echo "$@" >> "$HERMES_HOME/calls.log"
if [[ "$1" == "config" && "$2" == "set" ]]; then
  python3 - "$HERMES_HOME/config.yaml" "$3" "$4" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
cli_key = sys.argv[2]
cli_value = sys.argv[3]
data = {}
if path.exists():
    current = None
    for line in path.read_text().splitlines():
        if not line.strip() or ":" not in line:
            continue
        if not line.startswith(" "):
            key, raw_value = line.split(":", 1)
            key = key.strip()
            value = raw_value.strip()
            if value:
                data[key] = value
                current = None
            else:
                data.setdefault(key, {})
                current = key
        elif current:
            key, raw_value = line.split(":", 1)
            data.setdefault(current, {})[key.strip()] = raw_value.strip()
target = data
parts = cli_key.split(".")
for part in parts[:-1]:
    target = target.setdefault(part, {})
target[parts[-1]] = cli_value
def dump(obj, indent=0):
    out = []
    for k, v in obj.items():
        if isinstance(v, dict):
            out.append(" " * indent + f"{k}:")
            out.extend(dump(v, indent + 2))
        else:
            out.append(" " * indent + f"{k}: {v}")
    return out
path.write_text("\\n".join(dump(data)) + "\\n")
PY
  exit 0
fi
exit 2
""",
            encoding="utf-8",
        )
        fake_hermes.chmod(0o755)
        monkeypatch.setenv("HERMES_STUDIO_HERMES_HOME", str(hermes_home))
        monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}")

        backend = HermesBackend("http://hermes.test")
        result = await backend.patch_model_config({"provider": "glm", "model": "glm-5"})

        await backend.close()
        assert result["provider"] == "glm"
        assert result["model"] == "glm-5"
        assert result["status"] == "updated"
        assert (hermes_home / "calls.log").read_text(encoding="utf-8").splitlines() == [
            "config set model.provider glm",
            "config set model.default glm-5",
        ]

    async def test_activate_profile_uses_hermes_profile_use_cli(self, tmp_path, monkeypatch):
        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        monkeypatch.setenv("HERMES_STUDIO_HERMES_HOME", str(hermes_home))
        captured: list[list[str]] = []

        def fake_run(
            args: list[str],
            *,
            capture_output: bool,
            text: bool,
            timeout: int,
            check: bool = False,
            env: dict[str, str] | None = None,
        ) -> subprocess.CompletedProcess[str]:
            captured.append(args)
            return subprocess.CompletedProcess(args, 0, stdout="profile switched", stderr="")

        monkeypatch.setattr("hermes_adapter._subprocess.subprocess.run", fake_run)
        monkeypatch.setattr("hermes_adapter._subprocess.shutil.which", lambda name: f"/fake/path/{name}")

        backend = HermesBackend("http://hermes.test")
        result = await backend.activate_profile("research")

        await backend.close()
        assert result == {"status": "activated", "profile": "research", "source": "cli"}
        assert captured and captured[0][-3:] == ["profile", "use", "research"]

    async def test_stream_run_events(self, fake_hermes):
        backend = HermesBackend(fake_hermes)
        result = await backend.start_run("s-1", "hello")
        run_id = result["run_id"]

        events = []
        async for event in backend.stream_run_events(run_id):
            events.append(event)

        types = [e["type"] for e in events]
        assert "assistant.delta" in types
        assert "run.completed" in types
        await backend.close()

    async def test_stop_run(self, fake_hermes):
        backend = HermesBackend(fake_hermes)
        result = await backend.start_run("s-1", "hello")
        run_id = result["run_id"]

        stop_result = await backend.stop_run(run_id)
        assert stop_result["status"] == "stopping"
        await backend.close()

    async def test_start_run_when_unavailable(self, fake_hermes_unavailable):
        backend = HermesBackend(fake_hermes_unavailable)
        result = await backend.start_run("s-1", "hello")
        assert result["status"] == "failed"
        assert "error" in result
        await backend.close()


class TestHermesCliBackend:
    async def test_local_cli_run_streams_output(self, tmp_path, monkeypatch):
        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        fake_hermes = bin_dir / "hermes"
        fake_hermes.write_text(
            """#!/bin/sh
set -eu
if [ "${1:-}" = "--version" ]; then
  echo "Hermes Agent test"
  exit 0
fi
if [ "${1:-}" = "chat" ]; then
  echo "local cli response"
  exit 0
fi
exit 2
""",
            encoding="utf-8",
        )
        fake_hermes.chmod(0o755)
        monkeypatch.setenv("HERMES_STUDIO_HERMES_HOME", str(hermes_home))
        monkeypatch.setenv("PATH", str(bin_dir))

        backend = HermesCliBackend()
        result = await backend.start_run(
            "default",
            "hello",
            context={"provider": "glm", "model": "glm-5", "toolsets": ["file"], "skills": ["design"]},
        )
        events = [event async for event in backend.stream_run_events(result["run_id"])]

        if hasattr(backend, "close"):
            await backend.close()  # type: ignore[attr-defined]
        assert result["transport"] == "local-cli"
        assert [event["type"] for event in events] == [
            "run.started",
            "adapter.warning",
            "assistant.delta",
            "assistant.completed",
            "run.completed",
        ]
        assert events[2]["payload"]["text"] == "local cli response\n"

    async def test_local_cli_run_forwards_hermes_flags(self, tmp_path, monkeypatch):
        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        command_log = tmp_path / "command.log"
        fake_hermes = bin_dir / "hermes"
        fake_hermes.write_text(
            """#!/bin/sh
set -eu
if [ "${1:-}" = "--version" ]; then
  echo "Hermes Agent test"
  exit 0
fi
if [ "${1:-}" = "chat" ]; then
  printf '%s\n' "$@" > "$COMMAND_LOG"
  echo "ok"
  exit 0
fi
exit 2
""",
            encoding="utf-8",
        )
        fake_hermes.chmod(0o755)
        monkeypatch.setenv("HERMES_STUDIO_HERMES_HOME", str(hermes_home))
        monkeypatch.setenv("COMMAND_LOG", str(command_log))
        monkeypatch.setenv("PATH", str(bin_dir))

        backend = HermesCliBackend()
        result = await backend.start_run(
            "session-1",
            "hello",
            context={
                "provider": "glm",
                "model": "glm-5",
                "toolsets": ["file", "browser"],
                "skills": ["systematic-debugging"],
                "checkpoints": True,
                "max_turns": 42,
                "worktree": True,
                "pass_session_id": True,
                "ignore_rules": True,
            },
        )
        events = [event async for event in backend.stream_run_events(result["run_id"])]

        assert events[-1]["type"] == "run.completed"
        args = command_log.read_text(encoding="utf-8").splitlines()
        assert args[:3] == ["chat", "--query", "hello"]
        assert "--provider" in args and "glm" in args
        assert "--model" in args and "glm-5" in args
        assert "--toolsets" in args and "file,browser" in args
        assert "--skills" in args and "systematic-debugging" in args
        assert "--checkpoints" in args
        assert "--max-turns" in args and "42" in args
        assert "--worktree" in args
        assert "--pass-session-id" in args
        assert "--ignore-rules" in args
        assert "--resume" in args and "session-1" in args

    @pytest.mark.parametrize(
        "invalid_target",
        [
            "host; rm -rf /",
            "user@host -oProxyCommand=...",
            "user@host\ncmd",
            "$(evil)",
            "host|grep",
            "user@host and stuff",
        ],
    )
    def test_remote_ssh_target_rejects_invalid_format(self, invalid_target: str) -> None:
        with pytest.raises(ValueError):
            HermesCliBackend(remote_ssh_target=invalid_target)

    @pytest.mark.parametrize(
        "valid_target",
        [
            "user@example.com",
            "example.com",
            "user@192.168.1.10",
            "192.168.1.1",
        ],
    )
    def test_remote_ssh_target_accepts_valid_format(self, valid_target: str) -> None:
        # Should not raise — valid target
        backend = HermesCliBackend(remote_ssh_target=valid_target)
        assert backend._remote_ssh_target == valid_target

    @pytest.mark.parametrize("invalid_bin", ["bin; rm -rf /", "bin$(whoami)", "bin`id`"])
    def test_remote_hermes_bin_rejects_unsafe_chars(self, invalid_bin: str) -> None:
        with pytest.raises(ValueError, match="unsafe"):
            HermesCliBackend(remote_ssh_target="user@example.com", remote_hermes_bin=invalid_bin)


# ---------------------------------------------------------------------------
# Auto mode fallback test
# ---------------------------------------------------------------------------


class TestAutoModeFallback:
    async def test_auto_uses_local_cli_when_available(self, tmp_path, monkeypatch):
        from hermes_adapter.backend_factory import create_backend

        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        fake_hermes = bin_dir / "hermes"
        fake_hermes.write_text("#!/bin/sh\necho 'Hermes Agent test'\n", encoding="utf-8")
        fake_hermes.chmod(0o755)
        monkeypatch.setenv("HERMES_STUDIO_BACKEND", "auto")
        monkeypatch.setenv("HERMES_STUDIO_HERMES_HOME", str(hermes_home))
        monkeypatch.setenv("PATH", str(bin_dir))

        backend, status = await create_backend()
        assert status["backend_mode"] == "auto"
        assert status["active_backend"] == "local-cli"
        assert status["hermes_connected"] is True

        if hasattr(backend, "close"):
            await backend.close()  # type: ignore[attr-defined]

    async def test_auto_falls_back_to_mock_when_local_cli_and_gateway_unavailable(self, tmp_path, monkeypatch):
        from hermes_adapter.backend_factory import create_backend

        empty_bin = tmp_path / "empty-bin"
        empty_bin.mkdir()
        monkeypatch.setenv("HERMES_STUDIO_BACKEND", "auto")
        monkeypatch.setenv("HERMES_API_BASE_URL", "http://127.0.0.1:19999")
        monkeypatch.setenv("PATH", str(empty_bin))

        backend, status = await create_backend()
        assert status["backend_mode"] == "auto"
        assert status["active_backend"] == "mock"
        assert status["hermes_connected"] is False

        if hasattr(backend, "close"):
            await backend.close()  # type: ignore[attr-defined]
