"""Hermes API client with mock backend for MVP."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import UTC
from typing import Any

import httpx

from hermes_adapter.models import RunRequest, RunResponse


class HermesClient:
    """Async client for interacting with the Hermes backend.

    For the MVP, stream_events yields mock events to simulate a real run.
    """

    def __init__(self, base_url: str = "http://127.0.0.1:39190") -> None:
        """Initialize the client with the Hermes base URL."""
        self._base_url = base_url
        timeout = httpx.Timeout(connect=10.0, read=60.0, write=30.0, pool=10.0)
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)

    async def health_check(self) -> dict[str, Any]:
        """Check Hermes health. Returns mock data for MVP."""
        # For MVP, pretend Hermes is always healthy.
        return {"status": "ok", "version": "0.9.0-mock"}

    async def get_capabilities(self) -> list[str]:
        """Return the list of capabilities supported by Hermes."""
        return [
            "chat",
            "tools",
            "files",
            "approval",
            "streaming",
        ]

    async def start_run(self, request: RunRequest) -> RunResponse:
        """Start a new run with the given request."""
        # For MVP, immediately return a mock run ID.
        return RunResponse(
            run_id=str(uuid.uuid4()),
            status="started",
        )

    async def stream_events(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
        """Yield mock Hermes-style SSE events for the given run ID."""
        chunks = ["Merhaba! ", "Size ", "nasıl ", "yardımcı ", "olabilirim?"]

        yield {
            "type": "run.started",
            "payload": {"run_id": run_id},
            "timestamp": _now_iso(),
        }
        await asyncio.sleep(0.1)

        for chunk in chunks:
            yield {
                "type": "assistant.delta",
                "payload": {"content": chunk},
                "timestamp": _now_iso(),
            }
            await asyncio.sleep(0.05)

        yield {
            "type": "tool.started",
            "payload": {"tool": "file_tree", "input": "."},
            "timestamp": _now_iso(),
        }
        await asyncio.sleep(0.1)

        for progress in (10, 50, 100):
            yield {
                "type": "tool.progress",
                "payload": {"tool": "file_tree", "progress": progress},
                "timestamp": _now_iso(),
            }
            await asyncio.sleep(0.05)

        yield {
            "type": "tool.completed",
            "payload": {"tool": "file_tree", "output": ["src/", "tests/", "README.md"]},
            "timestamp": _now_iso(),
        }
        await asyncio.sleep(0.1)

        yield {
            "type": "assistant.completed",
            "payload": {"run_id": run_id},
            "timestamp": _now_iso(),
        }
        await asyncio.sleep(0.1)

        yield {
            "type": "run.completed",
            "payload": {"run_id": run_id, "status": "success"},
            "timestamp": _now_iso(),
        }

    async def stop_run(self, run_id: str) -> dict[str, Any]:
        """Request to stop an active run."""
        return {"run_id": run_id, "status": "stopped"}

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()


def _now_iso() -> str:
    """Return the current UTC time as an ISO string."""
    from datetime import datetime

    return datetime.now(UTC).isoformat()
