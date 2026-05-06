"""Schema validation tests for Studio event emitters."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from jsonschema import Draft202012Validator, FormatChecker

from hermes_adapter import mock_backend
from hermes_adapter.event_normalizer import normalize_hermes_event
from hermes_adapter.hermes_backend import HermesBackend, _normalize_hermes_event
from hermes_adapter.mock_backend import MockBackend

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "protocol" / "events.schema.json"
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "hermes_sse_sample.jsonl"
VALIDATOR = Draft202012Validator(
    json.loads(SCHEMA_PATH.read_text(encoding="utf-8")),
    format_checker=FormatChecker(),
)


def assert_valid_event(event: dict[str, Any]) -> None:
    errors = sorted(VALIDATOR.iter_errors(event), key=lambda err: err.path)
    assert errors == [], "; ".join(error.message for error in errors)


@pytest.mark.asyncio
async def test_mock_backend_run_events_validate_against_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(mock_backend.asyncio, "sleep", no_sleep)

    backend = MockBackend()
    run = await backend.start_run("s-1", "hello")

    events: list[dict[str, Any]] = []
    async for event in backend.stream_run_events(run["run_id"]):
        assert_valid_event(event)
        events.append(event)

    assert events[-1]["type"] == "run.completed"


@pytest.mark.asyncio
async def test_mock_backend_missing_run_event_validates_against_schema() -> None:
    backend = MockBackend()
    events: list[dict[str, Any]] = []

    async for event in backend.stream_run_events("missing-run"):
        assert_valid_event(event)
        events.append(event)

    assert [event["type"] for event in events] == ["run.failed"]


@pytest.mark.asyncio
async def test_mock_backend_log_stream_events_validate_against_schema() -> None:
    backend = MockBackend()
    stream = backend.stream_logs(source="agent.log")

    event = await anext(stream)
    await stream.aclose()

    assert event["type"] == "log.line"
    assert_valid_event(event)


@pytest.mark.asyncio
async def test_hermes_backend_unavailable_run_stream_validates_against_schema() -> None:
    backend = HermesBackend("http://127.0.0.1:1")
    stream = backend.stream_run_events("run-unavailable")

    event = await anext(stream)
    await stream.aclose()
    await backend.close()

    assert event["type"] == "run.failed"
    assert_valid_event(event)


@pytest.mark.asyncio
async def test_hermes_backend_unavailable_log_stream_validates_against_schema() -> None:
    backend = HermesBackend("http://127.0.0.1:1")
    backend._log_repo = None
    stream = backend.stream_logs(source="agent.log")

    event = await anext(stream)
    await stream.aclose()
    await backend.close()

    assert event["type"] == "log.line"
    assert_valid_event(event)


@pytest.mark.asyncio
async def test_hermes_backend_http_run_stream_validates_against_schema() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/runs/run-1/events"
        return httpx.Response(
            200,
            content=(
                'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
                "data: [DONE]\n\n"
            ),
        )

    backend = HermesBackend("http://hermes.test")
    await backend._client.aclose()
    backend._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    backend._hermes_healthy = True

    events: list[dict[str, Any]] = []
    async for event in backend.stream_run_events("run-1"):
        assert_valid_event(event)
        events.append(event)

    await backend.close()
    assert [event["type"] for event in events] == ["assistant.delta", "run.completed"]


def test_hermes_fixture_replay_events_validate_against_schema() -> None:
    with FIXTURE_PATH.open(encoding="utf-8") as fixture:
        for line in fixture:
            if not line.strip():
                continue
            entry = json.loads(line)
            raw = entry.get("data", {})
            raw["type"] = entry.get("event", raw.get("type", "unknown"))
            assert_valid_event(_normalize_hermes_event(raw))


def test_unknown_events_validate_as_adapter_warning() -> None:
    hermes_event = _normalize_hermes_event({"type": "future.event", "payload": {"x": 1}})
    adapter_event = normalize_hermes_event({"type": "future.event", "payload": {"x": 1}})

    assert hermes_event["type"] == "adapter.warning"
    assert adapter_event["type"] == "adapter.warning"
    assert_valid_event(hermes_event)
    assert_valid_event(adapter_event)


def test_malformed_kanban_updated_events_validate_as_adapter_warning() -> None:
    hermes_event = _normalize_hermes_event({"type": "kanban.updated", "payload": {"task_id": "legacy-task"}})
    adapter_event = normalize_hermes_event({"type": "kanban.updated", "payload": {"task_id": "legacy-task"}})

    assert hermes_event["type"] == "adapter.warning"
    assert adapter_event["type"] == "adapter.warning"
    assert hermes_event["payload"]["code"] == "malformed_kanban_updated"
    assert adapter_event["payload"]["code"] == "malformed_kanban_updated"
    assert_valid_event(hermes_event)
    assert_valid_event(adapter_event)


def test_valid_kanban_updated_events_validate_against_schema() -> None:
    payload = {
        "board_id": "board_default",
        "action": "card_status_changed",
        "card_id": "card_123",
        "column_id": "col_default_doing",
        "position": 0,
    }
    hermes_event = _normalize_hermes_event({"type": "kanban.updated", "payload": payload})
    adapter_event = normalize_hermes_event({"type": "kanban.updated", "payload": payload})

    assert hermes_event["type"] == "kanban.updated"
    assert adapter_event["type"] == "kanban.updated"
    assert_valid_event(hermes_event)
    assert_valid_event(adapter_event)
