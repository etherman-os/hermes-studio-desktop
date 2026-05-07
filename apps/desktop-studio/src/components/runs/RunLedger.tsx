import React from "react";
import type { StudioEvent } from "../../api/studioClient";
import { useRunLedgerStore, type RunRecord } from "../../stores/runLedgerStore";

interface TimelineEntry {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  summary: string;
  events: StudioEvent[];
}

function summarizeEvent(event: StudioEvent) {
  const payload = event.payload;
  switch (event.type) {
    case "run.started":
      return `Run ${payload.run_id ?? event.run_id ?? ""} started`;
    case "assistant.delta":
      return typeof payload.text === "string" ? payload.text : "Assistant stream";
    case "tool.started":
      return `Tool started: ${payload.tool ?? "unknown"}`;
    case "tool.progress":
      return `${payload.tool ?? "Tool"} progress${payload.message ? `: ${payload.message}` : ""}`;
    case "tool.completed":
      return `Tool completed: ${payload.tool ?? "unknown"}${payload.success === false ? " failed" : ""}`;
    case "approval.requested":
      return `Approval requested: ${payload.tool ?? "tool"} ${payload.action ?? ""}`;
    case "approval.resolved":
      return `Approval ${payload.decision ?? "resolved"}`;
    case "memory.updated":
      return `Memory ${payload.action ?? "updated"}`;
    case "kanban.updated":
      return `Board ${payload.action ?? "updated"}`;
    case "run.completed":
      return "Run completed";
    case "run.failed":
      return typeof payload.message === "string" ? payload.message : "Run failed";
    case "run.cancelled":
      return "Run cancelled";
    case "adapter.warning":
      return typeof payload.message === "string" ? payload.message : "Adapter warning";
    default:
      return event.type;
  }
}

function buildTimeline(events: StudioEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let assistantGroup: TimelineEntry | null = null;

  for (const event of events) {
    if (event.type === "assistant.delta") {
      if (!assistantGroup) {
        assistantGroup = {
          id: `assistant_${event.id}`,
          type: "assistant.message",
          source: event.source,
          timestamp: event.timestamp,
          summary: "",
          events: [],
        };
        entries.push(assistantGroup);
      }
      assistantGroup.events.push(event);
      assistantGroup.summary += summarizeEvent(event);
      continue;
    }

    assistantGroup = null;
    entries.push({
      id: event.id,
      type: event.type,
      source: event.source,
      timestamp: event.timestamp,
      summary: summarizeEvent(event),
      events: [event],
    });
  }

  return entries;
}

function duration(run: RunRecord) {
  const start = Date.parse(run.startedAt);
  const end = Date.parse(run.completedAt ?? new Date().toISOString());
  if (Number.isNaN(start) || Number.isNaN(end)) return "n/a";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

export function RunLedger() {
  const runs = useRunLedgerStore((s) => s.runs);
  const currentRunId = useRunLedgerStore((s) => s.currentRunId);
  const selectedEventId = useRunLedgerStore((s) => s.selectedEventId);
  const selectEvent = useRunLedgerStore((s) => s.selectEvent);
  const run = runs.find((item) => item.runId === currentRunId) ?? runs[0] ?? null;
  const timeline = React.useMemo(() => buildTimeline(run?.events ?? []), [run?.events]);
  const selected = timeline.find((entry) => entry.id === selectedEventId)
    ?? timeline.find((entry) => entry.events.some((event) => event.id === selectedEventId))
    ?? timeline[0]
    ?? null;

  if (!run) {
    return (
      <div className="workbench-empty">
        <div className="workbench-empty-title">No runs captured yet</div>
        <div className="workbench-empty-copy">
          Start a prompt from Chat and the run ledger will track stream, tool, approval, warning, memory, and board events here.
        </div>
      </div>
    );
  }

  return (
    <div className="run-ledger">
      <div className="run-ledger-header">
        <div>
          <div className="workbench-eyebrow">Run Ledger</div>
          <div className="run-ledger-title">{run.prompt || "Local adapter event"}</div>
        </div>
        <div className="run-ledger-stats">
          <span className={`status-pill status-${run.status}`}>{run.status}</span>
          <span>{run.events.length} events</span>
          <span>{duration(run)}</span>
        </div>
      </div>

      <div className="run-ledger-meta">
        <span>Run {run.runId}</span>
        <span>Session {run.sessionId}</span>
        <span>Started {formatTime(run.startedAt)}</span>
        {run.completedAt && <span>Ended {formatTime(run.completedAt)}</span>}
      </div>

      <div className="run-ledger-body">
        <div className="timeline-list selectable">
          {timeline.map((entry) => (
            <button
              key={entry.id}
              className={`timeline-entry ${selected?.id === entry.id ? "active" : ""}`}
              onClick={() => selectEvent(entry.id)}
            >
              <span className="timeline-marker" />
              <span className="timeline-main">
                <span className="timeline-type">{entry.type}</span>
                <span className="timeline-summary">{entry.summary}</span>
              </span>
              <span className="timeline-side">
                <span>{entry.source}</span>
                <span>{formatTime(entry.timestamp)}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="event-detail selectable">
          {selected ? (
            <>
              <div className="event-detail-header">
                <div>
                  <div className="workbench-eyebrow">Selected Event</div>
                  <div className="event-detail-title">{selected.type}</div>
                </div>
                <span>{formatTime(selected.timestamp)}</span>
              </div>
              <dl className="event-detail-meta">
                <dt>Source</dt>
                <dd>{selected.source}</dd>
                <dt>Events</dt>
                <dd>{selected.events.length}</dd>
              </dl>
              <pre className="event-payload">{JSON.stringify(selected.events.map((event) => event.payload), null, 2)}</pre>
            </>
          ) : (
            <div className="workbench-empty compact">Select an event to inspect payload details.</div>
          )}
        </div>
      </div>
    </div>
  );
}
