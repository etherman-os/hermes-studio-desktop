"""Fixture replay test — replay captured Hermes SSE through normalizer."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from hermes_adapter.hermes_backend import _normalize_hermes_event

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "hermes_sse_sample.jsonl"
REAL_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "hermes_sse_real_sample.jsonl"


def _replay_fixture(path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            data = entry.get("data", {})
            # Normalize flat fixture format to what the normalizer expects.
            # The fixture stores event fields directly in data (e.g. delta, tool,
            # timestamp) rather than nested under a payload wrapper.
            raw: dict[str, Any] = {
                "event": data.get("event", "unknown"),
                "run_id": data.get("run_id"),
                "timestamp": data.get("timestamp"),
                "payload": {
                    k: v for k, v in data.items()
                    if k not in ("event", "run_id", "timestamp")
                },
            }
            normalized = _normalize_hermes_event(raw)
            events.append(normalized)
    return events


class TestFixtureReplay:
    def test_fixture_exists(self) -> None:
        assert FIXTURE_PATH.exists(), f"Fixture not found: {FIXTURE_PATH}"
        assert REAL_FIXTURE_PATH.exists(), f"Fixture not found: {REAL_FIXTURE_PATH}"

    def test_fixture_replay_no_crash(self) -> None:
        """Replay all fixture events through normalizer. Must not crash."""
        for fixture_path in (FIXTURE_PATH, REAL_FIXTURE_PATH):
            events = _replay_fixture(fixture_path)
            assert len(events) > 0, f"No events in fixture: {fixture_path}"

    def test_fixture_produces_expected_events(self) -> None:
        """Fixture should produce at least assistant.delta or run.completed."""
        events = _replay_fixture(FIXTURE_PATH) + _replay_fixture(REAL_FIXTURE_PATH)
        types = {e["type"] for e in events}
        assert "assistant.delta" in types or "run.completed" in types, f"Unexpected types: {types}"

    def test_fixture_unknown_events_become_adapter_warning(self) -> None:
        """Unknown event types should become adapter.warning."""
        raw = {"type": "completely.unknown.event.type", "payload": {"data": "test"}}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "adapter.warning"
        assert "unknown" in result["payload"]["message"].lower()

    def test_assistant_delta_includes_text(self) -> None:
        """Normalized assistant.delta must include payload.text for frontend rendering."""
        # content_block_delta with nested delta.text
        raw = {"type": "content_block_delta", "payload": {"delta": {"type": "text_delta", "text": "Hello! "}}}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "assistant.delta"
        assert "text" in result["payload"], f"Missing 'text' in payload: {result['payload']}"
        assert result["payload"]["text"] == "Hello! "

        # assistant.delta with flat text
        raw = {"type": "assistant.delta", "payload": {"text": "World!"}}
        result = _normalize_hermes_event(raw)
        assert result["type"] == "assistant.delta"
        assert result["payload"]["text"] == "World!"

    def test_fixture_assistant_delta_events_have_text(self) -> None:
        """All assistant.delta events in fixture must have non-empty text."""
        for fixture_path in (FIXTURE_PATH, REAL_FIXTURE_PATH):
            for normalized in _replay_fixture(fixture_path):
                if normalized["type"] == "assistant.delta":
                    assert "text" in normalized["payload"], f"assistant.delta missing text: {normalized}"
                    assert len(normalized["payload"]["text"]) > 0, "assistant.delta has empty text"
