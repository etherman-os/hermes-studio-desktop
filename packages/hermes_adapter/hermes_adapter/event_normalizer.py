"""Hermes event normalizer — defensive mapping from raw Hermes SSE events."""

from __future__ import annotations

from typing import Any

from hermes_adapter.studio_events import StudioEventSource, make_studio_event

TERMINAL_EVENTS = {
    "run.completed",
    "run.failed",
    "run.cancelled",
}

KNOWN_TYPES = {
    "run.started",
    "assistant.delta",
    "assistant.completed",
    "tool.started",
    "tool.progress",
    "tool.completed",
    "approval.requested",
    "approval.resolved",
    "run.completed",
    "run.failed",
    "run.cancelled",
    "log.line",
    "adapter.warning",
    "kanban.updated",
    "memory.updated",
    "lint.result",
}


def _source_from(raw_event: dict[str, Any]) -> StudioEventSource:
    source = raw_event.get("source")
    if source == "adapter":
        return "adapter"
    if source == "studio":
        return "studio"
    return "hermes"


def _payload_from(raw_event: dict[str, Any]) -> dict[str, Any]:
    payload = raw_event.get("payload", {})
    if isinstance(payload, dict):
        # If payload is empty but the raw event has top-level fields
        # (e.g. flat Hermes SSE format), promote them to the payload.
        if not payload:
            excluded = {"event", "type", "source", "id", "timestamp", "run_id", "session_id"}
            payload = {k: v for k, v in raw_event.items() if k not in excluded and v is not None}
        return payload
    return {"value": payload}


def _event_type_from(raw: dict[str, Any]) -> str:
    event_type = raw.get("type") or raw.get("event") or ""
    return str(event_type)


def _duration_ms_from(payload: dict[str, Any]) -> int | None:
    duration_ms = payload.get("duration_ms")
    if isinstance(duration_ms, int):
        return duration_ms
    duration = payload.get("duration")
    if isinstance(duration, (int, float)):
        return int(duration * 1000)
    return None


def _total_tokens_from(payload: dict[str, Any]) -> int | None:
    total_tokens = payload.get("total_tokens")
    if isinstance(total_tokens, int):
        return total_tokens
    usage = payload.get("usage")
    if isinstance(usage, dict):
        usage_total_tokens = usage.get("total_tokens")
        if isinstance(usage_total_tokens, int):
            return usage_total_tokens
    return None


def _sse_event(
    event_type: str,
    data: dict[str, Any],
    *,
    source: StudioEventSource = "hermes",
    run_id: str | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    return make_studio_event(
        event_type,
        data,
        source=source,
        run_id=run_id,
        session_id=session_id,
    )


def normalize_kanban_updated_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Return a schema-safe kanban.updated payload, or None when malformed."""
    board_id = payload.get("board_id")
    action = payload.get("action")
    if not isinstance(board_id, str) or not board_id.strip():
        return None
    if not isinstance(action, str) or not action.strip():
        return None

    normalized: dict[str, Any] = {
        "board_id": board_id.strip(),
        "action": action.strip(),
    }
    for field in ("card_id", "column_id", "task_id"):
        value = payload.get(field)
        if value is None:
            continue
        if not isinstance(value, str) or not value.strip():
            return None
        normalized[field] = value.strip()

    if "position" in payload:
        position = payload["position"]
        if isinstance(position, bool) or not isinstance(position, int) or position < 0:
            return None
        normalized["position"] = position

    return normalized


def is_valid_kanban_updated_payload(payload: dict[str, Any]) -> bool:
    """Return True when a kanban.updated payload is structured enough to emit."""
    return normalize_kanban_updated_payload(payload) is not None


def _normalize_hermes_event(raw: dict[str, Any]) -> dict[str, Any]:
    """Convert raw Hermes SSE event into Studio event format.

    Hermes events may have different shapes. This function normalizes them
    into the Studio event schema without leaking Hermes-specific details.
    """
    event_type = _event_type_from(raw)
    payload = _payload_from(raw)
    source = _source_from(raw)
    run_id = payload.get("run_id", raw.get("run_id", ""))
    session_id = payload.get("session_id", raw.get("session_id", ""))

    # Handle OpenAI-compatible delta format
    choices = raw.get("choices")
    if choices and isinstance(choices, list) and len(choices) > 0:
        delta = choices[0].get("delta", {})
        content = delta.get("content")
        if content:
            return _sse_event("assistant.delta", {"text": content}, source=source, run_id=raw.get("run_id"))
        # Check for tool calls
        tool_calls = delta.get("tool_calls")
        if tool_calls and isinstance(tool_calls, list):
            for tc in tool_calls:
                func = tc.get("function", {})
                return _sse_event(
                    "tool.started",
                    {
                        "tool": func.get("name", "unknown"),
                        "tool_call_id": tc.get("id"),
                    },
                    source=source,
                    run_id=raw.get("run_id"),
                )

    # Handle Hermes-specific event types
    if event_type in ("run.started", "run_start", "turn_start"):
        return _sse_event(
            "run.started",
            {
                "run_id": run_id,
                "session_id": session_id,
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("assistant.delta", "message.delta", "text_delta", "content_block_delta"):
        delta = payload.get("delta")
        text = payload.get("text")
        if text is None:
            text = payload.get("content")
        if text is None:
            text = delta.get("text", "") if isinstance(delta, dict) else delta or ""
        if not isinstance(text, str):
            text = str(text)
        return _sse_event("assistant.delta", {"text": text}, source=source, run_id=run_id, session_id=session_id)

    if event_type in ("assistant.completed", "text_done", "content_block_stop"):
        return _sse_event(
            "assistant.completed",
            {
                "model": payload.get("model"),
                "total_tokens": _total_tokens_from(payload),
                "duration_ms": _duration_ms_from(payload),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("tool.started", "tool_start"):
        return _sse_event(
            "tool.started",
            {
                "tool": payload.get("tool", payload.get("name", "unknown")),
                "tool_call_id": payload.get("tool_call_id"),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("tool.progress", "tool_progress"):
        return _sse_event(
            "tool.progress",
            {
                "tool": payload.get("tool", "unknown"),
                "progress": payload.get("progress"),
                "message": payload.get("message"),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("tool.completed", "tool_end", "tool_result"):
        success = payload.get("success")
        if not isinstance(success, bool):
            success = not bool(payload.get("error")) if "error" in payload else True
        return _sse_event(
            "tool.completed",
            {
                "tool": payload.get("tool", payload.get("name", "unknown")),
                "success": success,
                "duration_ms": _duration_ms_from(payload),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("approval.requested",):
        return _sse_event(
            "approval.requested",
            {
                "approval_id": payload.get("approval_id", ""),
                "tool": payload.get("tool", ""),
                "action": payload.get("action", ""),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("approval.resolved",):
        return _sse_event(
            "approval.resolved",
            {
                "approval_id": payload.get("approval_id", ""),
                "decision": payload.get("decision", "approved"),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("run.completed", "run_end", "turn_end"):
        # Check if this is actually a failure
        if payload.get("status") == "failed" or payload.get("error"):
            return _sse_event(
                "run.failed",
                {
                    "run_id": run_id,
                    "message": payload.get("error", payload.get("message", "Run failed")),
                    "error_code": payload.get("error_code"),
                },
                source=source,
                run_id=run_id,
                session_id=session_id,
            )
        return _sse_event(
            "run.completed",
            {
                "run_id": run_id,
                "total_tokens": _total_tokens_from(payload),
                "duration_ms": _duration_ms_from(payload),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("run.failed", "error"):
        return _sse_event(
            "run.failed",
            {
                "run_id": run_id,
                "message": payload.get("message", payload.get("error", "Unknown error")),
                "error_code": payload.get("error_code"),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type in ("run.cancelled",):
        return _sse_event(
            "run.cancelled",
            {
                "run_id": run_id,
                "reason": payload.get("reason", "user_cancelled"),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    if event_type == "kanban.updated":
        kanban_payload = normalize_kanban_updated_payload(payload)
        if kanban_payload is None:
            return _sse_event(
                "adapter.warning",
                {
                    "code": "malformed_kanban_updated",
                    "message": "Ignored malformed kanban.updated event",
                    "original_type": event_type,
                },
                source="adapter",
                run_id=run_id,
                session_id=session_id,
            )
        return _sse_event(
            "kanban.updated",
            kanban_payload,
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    # Post-write delta lint results (v0.13.0)
    if event_type in ("lint.result", "post_write_lint"):
        return _sse_event(
            "lint.result",
            {
                "file": payload.get("file", ""),
                "linter": payload.get("linter", ""),
                "issues": payload.get("issues", []),
                "severity": payload.get("severity", "info"),
                "fixable": payload.get("fixable", False),
            },
            source=source,
            run_id=run_id,
            session_id=session_id,
        )

    # Unknown event — return as adapter.warning
    return _sse_event(
        "adapter.warning",
        {
            "code": "unknown_event",
            "message": f"Unknown Hermes event: {event_type}",
            "original_type": event_type,
        },
        source="adapter",
        run_id=run_id,
        session_id=session_id,
    )


def normalize_hermes_event(raw_event: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw Hermes event into the adapter's stable event schema."""
    event_type = raw_event.get("type", "")
    source = _source_from(raw_event)
    payload = _payload_from(raw_event)

    # Defensive: upstream sometimes signals failure inside run.completed
    if event_type == "run.completed":
        if payload.get("status") == "failed" or payload.get("error") is not None:
            return make_studio_event("run.failed", payload, source=source)
        return make_studio_event("run.completed", payload, source=source)

    if event_type == "kanban.updated":
        kanban_payload = normalize_kanban_updated_payload(payload)
        if kanban_payload is None:
            return make_studio_event(
                "adapter.warning",
                {
                    "code": "malformed_kanban_updated",
                    "message": "Ignored malformed kanban.updated event",
                    "original_type": event_type,
                },
                source="adapter",
            )
        return make_studio_event(event_type, kanban_payload, source=source)

    if event_type in KNOWN_TYPES:
        return make_studio_event(event_type, payload, source=source)

    # Lint results from post-write delta
    if event_type in ("lint.result", "post_write_lint"):
        return make_studio_event(
            "lint.result",
            {
                "file": payload.get("file", ""),
                "linter": payload.get("linter", ""),
                "issues": payload.get("issues", []),
                "severity": payload.get("severity", "info"),
            },
            source=source,
        )

    return make_studio_event(
        "adapter.warning",
        {
            "code": "unknown_event",
            "message": f"Unknown event type: {event_type}",
            "original_type": event_type,
        },
        source="adapter",
    )


def is_terminal_event(event_type: str) -> bool:
    """Return True if *event_type* represents a terminal run state."""
    return event_type in TERMINAL_EVENTS
