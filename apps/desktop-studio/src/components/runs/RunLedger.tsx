import React from "react";
import type { StudioEvent } from "../../api/studioClient";
import { extractRunArtifactCandidates } from "../../utils/artifactExtraction";
import { useApprovalStore } from "../../stores/approvalStore";
import { useArtifactStore } from "../../stores/artifactStore";
import { useContextStore } from "../../stores/contextStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useLogStore } from "../../stores/logStore";
import { useRunLedgerStore, type RunRecord } from "../../stores/runLedgerStore";
import { useSessionStore } from "../../stores/sessionStore";
import { EmptyState } from "../common/EmptyState";
import { Activity } from "lucide-react";
import { PreviewLauncher } from "../preview/PreviewLauncher";
import "./RunLedger.css";

interface TimelineEntry {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  summary: string;
  tone: "normal" | "warning" | "error" | "success";
  events: StudioEvent[];
}

function summarizeEvent(event: StudioEvent) {
  const payload = event.payload;
  switch (event.type) {
    case "run.started":
      return `Run ${payload.run_id ?? event.run_id ?? ""} started`;
    case "assistant.delta":
      return typeof payload.text === "string" ? payload.text : "Assistant stream";
    case "assistant.completed":
      return `Assistant completed${payload.model ? ` with ${payload.model}` : ""}`;
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

function eventTone(event: StudioEvent): TimelineEntry["tone"] {
  if (event.type === "run.failed") return "error";
  if (event.type === "adapter.warning" || event.type === "run.cancelled") return "warning";
  if (event.type === "approval.requested") return "warning";
  if (event.type === "approval.resolved") {
    const decision = String(event.payload.decision ?? "");
    return decision === "approved" ? "success" : "warning";
  }
  if (event.type === "run.completed" || (event.type === "tool.completed" && event.payload.success !== false)) return "success";
  if (event.type === "tool.completed" && event.payload.success === false) return "error";
  return "normal";
}

function toolKey(event: StudioEvent) {
  const callId = event.payload.tool_call_id;
  if (typeof callId === "string" && callId) return callId;
  return `${event.payload.tool ?? "tool"}_${event.id}`;
}

function buildTimeline(events: StudioEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const toolGroups = new Map<string, TimelineEntry>();
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
          tone: "normal",
          events: [],
        };
        entries.push(assistantGroup);
      }
      assistantGroup.events.push(event);
      assistantGroup.summary += summarizeEvent(event);
      continue;
    }

    assistantGroup = null;

    if (event.type === "tool.started" || event.type === "tool.progress" || event.type === "tool.completed") {
      const key = toolKey(event);
      const existing = toolGroups.get(key);
      if (existing) {
        existing.events.push(event);
        existing.summary = summarizeEvent(event);
        existing.tone = eventTone(event);
        continue;
      }
      const entry: TimelineEntry = {
        id: `tool_${key}`,
        type: "tool.call",
        source: event.source,
        timestamp: event.timestamp,
        summary: summarizeEvent(event),
        tone: eventTone(event),
        events: [event],
      };
      toolGroups.set(key, entry);
      entries.push(entry);
      continue;
    }

    entries.push({
      id: event.id,
      type: event.type,
      source: event.source,
      timestamp: event.timestamp,
      summary: summarizeEvent(event),
      tone: eventTone(event),
      events: [event],
    });
  }

  return entries;
}

function duration(run: RunRecord) {
  if (run.durationMs !== undefined) {
    const seconds = Math.max(0, Math.round(run.durationMs / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
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

function runTitle(run: RunRecord) {
  return run.prompt || run.runId;
}

function extractRunUrl(run: RunRecord): string | null {
  for (const event of run.events) {
    const payload = event.payload;
    if (typeof payload === "object" && payload !== null) {
      for (const key of ["url", "href", "link", "output_url", "result_url"]) {
        const val = (payload as Record<string, unknown>)[key];
        if (typeof val === "string" && val.startsWith("http")) return val;
      }
    }
  }
  return null;
}

function copySummary(run: RunRecord) {
  const timeline = buildTimeline(run.events);
  const lines = [
    `Run: ${run.runId}`,
    `Status: ${run.status}`,
    `Session: ${run.sessionId ?? "none"}`,
    `Workspace: ${run.workspacePath ?? "none"}`,
    `Backend: ${run.backend ?? "unknown"}`,
    `Model: ${run.model ?? "unknown"}`,
    `Duration: ${duration(run)}`,
    "",
    `Prompt: ${run.prompt || "(not captured)"}`,
    "",
    "Timeline:",
    ...timeline.map((entry) => `- ${entry.type}: ${entry.summary}`),
  ];
  return navigator.clipboard?.writeText(lines.join("\n"));
}

function runMarkdownReport(run: RunRecord) {
  const timeline = buildTimeline(run.events);
  const toolEvents = timeline.filter((entry) => entry.type === "tool.call");
  const warnings = timeline.filter((entry) => entry.tone === "warning" || entry.tone === "error");
  return [
    "# Run Summary",
    "",
    `- Run ID: ${run.runId}`,
    `- Status: ${run.status}`,
    `- Session: ${run.sessionId ?? "none"}`,
    `- Workspace: ${run.workspacePath ?? "none"}`,
    `- Backend: ${run.backend ?? "unknown"}`,
    `- Model: ${run.model ?? "unknown"}`,
    `- Started: ${run.startedAt}`,
    `- Completed: ${run.completedAt ?? "n/a"}`,
    `- Duration: ${duration(run)}`,
    "",
    "## Prompt Preview",
    "",
    run.prompt || "(not captured)",
    "",
    "## Tool Events",
    "",
    ...(toolEvents.length ? toolEvents.map((entry) => `- ${entry.summary}`) : ["- No tool events captured"]),
    "",
    "## Warnings and Errors",
    "",
    ...(warnings.length ? warnings.map((entry) => `- ${entry.type}: ${entry.summary}`) : ["- None captured"]),
    "",
    "## Timeline",
    "",
    ...timeline.map((entry) => `- ${entry.type}: ${entry.summary}`),
  ].join("\n");
}

export function RunLedger() {
  const runs = useRunLedgerStore((s) => s.runs);
  const selectedRunId = useRunLedgerStore((s) => s.selectedRunId);
  const currentRunId = useRunLedgerStore((s) => s.currentRunId);
  const selectedEventId = useRunLedgerStore((s) => s.selectedEventId);
  const loading = useRunLedgerStore((s) => s.loading);
  const error = useRunLedgerStore((s) => s.error);
  const historyAvailable = useRunLedgerStore((s) => s.historyAvailable);
  const savingRunCard = useRunLedgerStore((s) => s.savingRunCard);
  const actionMessage = useRunLedgerStore((s) => s.actionMessage);
  const comparison = useRunLedgerStore((s) => s.comparison);
  const comparingRuns = useRunLedgerStore((s) => s.comparingRuns);
  const selectRun = useRunLedgerStore((s) => s.selectRun);
  const selectEvent = useRunLedgerStore((s) => s.selectEvent);
  const loadRecentRuns = useRunLedgerStore((s) => s.loadRecentRuns);
  const loadRunLedger = useRunLedgerStore((s) => s.loadRunLedger);
  const compareRuns = useRunLedgerStore((s) => s.compareRuns);
  const createCardFromRun = useRunLedgerStore((s) => s.createCardFromRun);
  const clearActionMessage = useRunLedgerStore((s) => s.clearActionMessage);
  const createArtifact = useArtifactStore((s) => s.createArtifact);
  const artifactSaving = useArtifactStore((s) => s.saving);
  const artifactMessage = useArtifactStore((s) => s.actionMessage);
  const artifactError = useArtifactStore((s) => s.error);
  const loadRunContext = useContextStore((s) => s.loadRunContext);
  const approvals = useApprovalStore((s) => s.approvals);
  const pendingApprovals = useApprovalStore((s) => s.pending);
  const loadApprovalsForRun = useApprovalStore((s) => s.loadApprovalsForRun);
  const logLines = useLogStore((s) => s.lines);
  const loadRecentLogs = useLogStore((s) => s.loadRecent);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const setSidebarSection = useLayoutStore((s) => s.setSidebarSection);
  const showSidebar = useLayoutStore((s) => s.showSidebar);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const run = runs.find((item) => item.runId === selectedRunId)
    ?? runs.find((item) => item.runId === currentRunId)
    ?? runs[0]
    ?? null;
  const requestedLedgerIds = React.useRef(new Set<string>());
  const timeline = React.useMemo(() => buildTimeline(run?.events ?? []), [run?.events]);
  const extractedArtifactCandidates = React.useMemo(() => (
    run ? extractRunArtifactCandidates({
      runId: run.runId,
      sessionId: run.sessionId,
      prompt: run.prompt,
      events: run.events,
    }) : []
  ), [run]);
  const approvalEvents = React.useMemo(
    () => (run?.events ?? []).filter((event) => event.type === "approval.requested" || event.type === "approval.resolved"),
    [run?.events],
  );
  const runApprovals = React.useMemo(() => {
    if (!run) return [];
    const stored = approvals.filter((approval) => approval.run_id === run.runId);
    const pending = pendingApprovals.filter((approval) => approval.run_id === run.runId);
    const byId = new Map([...stored, ...pending].map((approval) => [approval.id, approval]));
    return Array.from(byId.values());
  }, [approvals, pendingApprovals, run]);
  const selected = React.useMemo(() => (
    timeline.find((entry) => entry.id === selectedEventId)
    ?? timeline.find((entry) => entry.events.some((event) => event.id === selectedEventId))
    ?? timeline[0]
    ?? null
  ), [timeline, selectedEventId]);
  const compareOptions = React.useMemo(() => runs.filter((item) => item.runId !== run?.runId), [run?.runId, runs]);
  const [compareTargetId, setCompareTargetId] = React.useState<string>("");
  const runUrl = React.useMemo(() => (run ? extractRunUrl(run) : null), [run]);
  const toolCount = React.useMemo(() => timeline.filter((entry) => entry.type === "tool.call").length, [timeline]);
  const assistantEventCount = React.useMemo(
    () => (run?.events ?? []).filter((event) => event.type === "assistant.delta" || event.type === "assistant.completed").length,
    [run?.events],
  );
  const warningCount = React.useMemo(
    () => timeline.filter((entry) => entry.tone === "warning" || entry.tone === "error").length,
    [timeline],
  );
  const approvalCount = React.useMemo(() => Math.max(runApprovals.length, approvalEvents.length), [runApprovals, approvalEvents]);

  React.useEffect(() => {
    if (!run || run.events.length > 0 || run.runId.startsWith("pending_") || run.runId.startsWith("local_")) return;
    if (requestedLedgerIds.current.has(run.runId)) return;
    requestedLedgerIds.current.add(run.runId);
    void loadRunLedger(run.runId);
  }, [run, loadRunLedger]);

  React.useEffect(() => {
    if (!compareOptions.some((item) => item.runId === compareTargetId)) {
      setCompareTargetId(compareOptions[0]?.runId ?? "");
    }
  }, [compareOptions, compareTargetId]);

  async function handleCopySummary() {
    if (!run) return;
    try {
      await copySummary(run);
      clearActionMessage();
    } catch {
      // Clipboard can be unavailable in strict contexts; do not block the ledger.
    }
  }

  function openSession() {
    if (!run?.sessionId) return;
    setActiveSession(run.sessionId);
    setActiveTab("sessions");
  }

  async function createRunSummaryArtifact(kind: "summary" | "report") {
    if (!run) return;
    const content = runMarkdownReport(run);
    const artifact = await createArtifact({
      title: `${kind === "report" ? "Markdown report" : "Run summary"}: ${runTitle(run).slice(0, 80)}`,
      type: kind === "report" ? "report" : "markdown",
      description: `Created from run ${run.runId}`,
      content_text: content,
      run_id: run.runId,
      session_id: run.sessionId,
      source: "run",
    });
    if (artifact) setActiveTab("artifacts");
  }

  async function createLogSnapshotArtifact() {
    if (!run) return;
    if (logLines.length === 0) await loadRecentLogs();
    const lines = useLogStore.getState().lines;
    const content = lines.slice(-100).map((line) => line.message).join("\n");
    const artifact = await createArtifact({
      title: `Log snapshot: ${runTitle(run).slice(0, 80)}`,
      type: "log_snapshot",
      description: `Recent adapter/Hermes log lines captured from run ${run.runId}`,
      content_text: content || "No log lines available when snapshot was created.",
      run_id: run.runId,
      session_id: run.sessionId,
      source: "run",
    });
    if (artifact) setActiveTab("artifacts");
  }

  async function extractRunArtifacts() {
    if (!run || extractedArtifactCandidates.length === 0) return;
    for (const candidate of extractedArtifactCandidates) {
      const { key: _key, language: _language, ...artifactInput } = candidate;
      await createArtifact(artifactInput);
    }
    setActiveTab("artifacts");
  }

  async function inspectRunContext() {
    if (!run) return;
    setSidebarSection("context");
    showSidebar();
    await loadRunContext(run.runId);
  }

  async function openRunApprovals() {
    if (!run) return;
    setSidebarSection("approvals");
    showSidebar();
    await loadApprovalsForRun(run.runId);
  }

  if (!run && !loading) {
    return (
      <>
        {error && (
          <div className="run-ledger-notice" role="alert">
            <span>Run history unavailable: {error}</span>
          </div>
        )}
        <EmptyState
          icon={Activity}
          title="No runs yet"
          description="Start a prompt from Chat and the run ledger will track stream, tool, approval, warning, memory, and board events here."
          action={{
            label: "Refresh run history",
            onClick: () => void loadRecentRuns(),
          }}
        />
      </>
    );
  }

  return (
    <div className="run-ledger" data-testid="run-ledger">
      <div className="run-ledger-header" data-testid="run-ledger-header">
        <div className="run-ledger-heading">
          <div className="workbench-eyebrow">Run Ledger</div>
          <div className="run-ledger-title">{run ? runTitle(run) : "Loading run history"}</div>
        </div>
        <div className="run-workbench-actions" aria-label="Run workbench actions">
          {run && (
            <div className="run-action-group">
              <div className="run-action-label">Create</div>
              <div className="run-action-buttons">
                {extractedArtifactCandidates.length > 0 && (
                  <button className="primary-button" onClick={() => void extractRunArtifacts()} disabled={artifactSaving}>
                    Extract Artifacts ({extractedArtifactCandidates.length})
                  </button>
                )}
                <button className="tool-button" onClick={() => void createCardFromRun(run.runId)} disabled={savingRunCard}>Create Card</button>
                <button className="tool-button" onClick={() => void createRunSummaryArtifact("summary")} disabled={artifactSaving}>Run Artifact</button>
                <button className="tool-button" onClick={() => void createRunSummaryArtifact("report")} disabled={artifactSaving}>Markdown Report</button>
                <button className="tool-button" onClick={() => void createLogSnapshotArtifact()} disabled={artifactSaving}>Log Snapshot</button>
              </div>
            </div>
          )}

          {run && (
            <div className="run-action-group">
              <div className="run-action-label">Inspect</div>
              <div className="run-action-buttons">
                {runUrl && (
                  <PreviewLauncher
                    url={runUrl}
                    title={runTitle(run)}
                    label="Preview URL"
                  />
                )}
                <button className="tool-button" onClick={() => void openRunApprovals()}>Approvals</button>
                <button className="tool-button" onClick={() => void inspectRunContext()}>Context</button>
                {run.sessionId && <button className="tool-button" onClick={openSession}>Session</button>}
              </div>
            </div>
          )}

          {run && (
            <div className="run-action-group">
              <div className="run-action-label">Export / Compare</div>
              <div className="run-action-buttons">
                <button className="tool-button" onClick={() => void handleCopySummary()}>Copy Summary</button>
                {compareOptions.length > 0 && (
                  <select
                    className="studio-select compact run-compare-select"
                    value={compareTargetId}
                    onChange={(event) => setCompareTargetId(event.target.value)}
                    aria-label="Compare run target"
                  >
                    {compareOptions.map((item) => (
                      <option key={item.runId} value={item.runId}>{runTitle(item).slice(0, 42)}</option>
                    ))}
                  </select>
                )}
                {compareTargetId && (
                  <button className="tool-button" onClick={() => void compareRuns(run.runId, compareTargetId)} disabled={comparingRuns}>
                    {comparingRuns ? "Comparing" : "Compare"}
                  </button>
                )}
              </div>
            </div>
          )}

          <button className="tool-button run-refresh-button" onClick={() => void loadRecentRuns()}>{loading ? "Refreshing" : "Refresh"}</button>
        </div>
      </div>

      {run && (
        <div className="run-workbench-top">
          <div className="run-status-strip" aria-label="Selected run status summary">
            <div className="run-status-card primary">
              <span className="run-status-label">Status</span>
              <strong><span className={`status-pill status-${run.status}`}>{run.status}</span></strong>
              <small>{duration(run)} · {run.events.length} events · {toolCount} tools</small>
            </div>
            <div className="run-status-card">
              <span className="run-status-label">Output</span>
              <strong>{runUrl ? "Preview URL captured" : assistantEventCount ? "Assistant output captured" : "No output yet"}</strong>
              <small>{assistantEventCount} assistant events</small>
            </div>
            <div className="run-status-card">
              <span className="run-status-label">Artifacts</span>
              <strong>{extractedArtifactCandidates.length ? `${extractedArtifactCandidates.length} extractable` : "None detected"}</strong>
              <small>{artifactSaving ? "Saving artifact" : artifactMessage || "Ready to create summaries"}</small>
            </div>
            <div className="run-status-card">
              <span className="run-status-label">Approvals / Logs</span>
              <strong>{approvalCount} approvals · {warningCount} warnings</strong>
              <small>{logLines.length ? `${logLines.length} recent log lines loaded` : "Log snapshot loads recent lines"}</small>
            </div>
          </div>
          <div className="run-ledger-meta" aria-label="Selected run identifiers">
            <span>Run {run.runId}</span>
            <span>Session {run.sessionId ?? "none"}</span>
            <span>Backend {run.backend ?? "live"}</span>
            <span>Model {run.model ?? "unknown"}</span>
            <span>Workspace {run.workspacePath ?? "none"}</span>
            <span>Started {formatTime(run.startedAt)}</span>
            {run.completedAt && <span>Ended {formatTime(run.completedAt)}</span>}
          </div>
        </div>
      )}

      {(!historyAvailable || error || actionMessage) && (
        <div className="run-ledger-notice">
          {error && <span>Run history unavailable: {error}</span>}
          {!error && !historyAvailable && <span>Run history is unavailable; live runs can still stream.</span>}
          {actionMessage && <span>{actionMessage}</span>}
        </div>
      )}

      {(artifactMessage || artifactError) && (
        <div className={`run-ledger-notice ${artifactError ? "warning" : ""}`}>
          {artifactError ? `Artifact unavailable: ${artifactError}` : artifactMessage}
        </div>
      )}

      {comparison && (
        <div className="run-compare-panel">
          <div className="run-compare-card">
            <span>Left</span>
            <strong>{comparison.left.run_id}</strong>
            <small>{comparison.left.status} · {comparison.left.event_count} events · {comparison.left.tool_names.length} tools</small>
          </div>
          <div className="run-compare-card">
            <span>Right</span>
            <strong>{comparison.right.run_id}</strong>
            <small>{comparison.right.status} · {comparison.right.event_count} events · {comparison.right.tool_names.length} tools</small>
          </div>
          <div className="run-compare-card delta">
            <span>Delta</span>
            <strong>{comparison.delta.event_count_delta >= 0 ? "+" : ""}{comparison.delta.event_count_delta} events</strong>
            <small>
              {comparison.delta.status_changed ? "status changed" : "same status"}
              {comparison.delta.error_delta ? ` · ${comparison.delta.error_delta >= 0 ? "+" : ""}${comparison.delta.error_delta} errors` : ""}
              {comparison.delta.added_tools.length ? ` · +${comparison.delta.added_tools.join(", ")}` : ""}
              {comparison.delta.removed_tools.length ? ` · -${comparison.delta.removed_tools.join(", ")}` : ""}
            </small>
          </div>
        </div>
      )}

      <div className="run-ledger-body">
        <div className="recent-runs-list selectable" role="listbox" aria-label="Recent runs" data-testid="run-list">
          <div className="pane-label">Recent Runs</div>
          {runs.map((item) => (
            <button
              key={item.runId}
              role="option"
              aria-selected={run?.runId === item.runId}
              className={`recent-run-item ${run?.runId === item.runId ? "active" : ""}`}
              data-testid={`run-item-${item.runId}`}
              onClick={() => {
                selectRun(item.runId);
                if (item.events.length === 0) void loadRunLedger(item.runId);
              }}
            >
              <span className="recent-run-title">{runTitle(item)}</span>
              <span className="recent-run-meta">
                <span className={`status-dot status-${item.status}`} aria-hidden="true" data-testid={`run-status-${item.runId}`} />
                {item.status}
                {item.sessionId ? ` - ${item.sessionId}` : ""}
              </span>
            </button>
          ))}
        </div>

        <div className="timeline-list selectable" role="listbox" aria-label="Run timeline" data-testid="timeline-list">
          {timeline.length === 0 && (
            <div className="workbench-empty compact" role="status">No events persisted for this run yet. Live events will appear as the stream arrives.</div>
          )}
          {timeline.map((entry) => (
            <button
              key={entry.id}
              role="option"
              aria-selected={selected?.id === entry.id}
              className={`timeline-entry ${entry.tone} ${selected?.id === entry.id ? "active" : ""}`}
              data-testid={`timeline-entry-${entry.id}`}
              onClick={() => selectEvent(entry.id)}
            >
              <span className="timeline-marker" aria-hidden="true" />
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
                <dt>Run</dt>
                <dd>{run?.runId ?? "none"}</dd>
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
