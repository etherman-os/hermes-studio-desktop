"""Tests for HermesBackend — real Hermes API integration."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from hermes_adapter.hermes_backend import HermesBackend, _normalize_hermes_event

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
        await backend.close()

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
            assert body == {"session_id": "s-1", "input": "hello"}
            return httpx.Response(202, json={"run_id": "run-1", "status": "started"})

        backend = HermesBackend("http://hermes.test")
        await backend._client.aclose()
        backend._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

        result = await backend.start_run("s-1", "hello", profile="ignored")

        await backend.close()
        assert result == {"run_id": "run-1", "status": "started"}

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


# ---------------------------------------------------------------------------
# Auto mode fallback test
# ---------------------------------------------------------------------------


class TestAutoModeFallback:
    async def test_auto_falls_back_to_mock_when_hermes_unavailable(self):
        import os

        from hermes_adapter.backend_factory import create_backend

        # Force auto mode with unavailable Hermes
        os.environ["HERMES_STUDIO_BACKEND"] = "auto"
        os.environ["HERMES_API_BASE_URL"] = "http://127.0.0.1:19999"

        backend, status = await create_backend()
        assert status["backend_mode"] == "auto"
        assert status["active_backend"] == "mock"
        assert status["hermes_connected"] is False

        # Cleanup
        os.environ.pop("HERMES_STUDIO_BACKEND", None)
        os.environ.pop("HERMES_API_BASE_URL", None)
