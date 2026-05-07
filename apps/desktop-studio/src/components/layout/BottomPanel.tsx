import React from "react";
import { useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { useLogStore } from "../../stores/logStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";
import { useDelegationStore } from "../../stores/delegationStore";
import { useCronStore } from "../../stores/cronStore";
import { RuntimeStatus } from "../runtime/RuntimeStatus";

export function BottomPanel() {
  const bottomTab = useLayoutStore((s) => s.bottomTab);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const label = useThemeStore((s) => s.label);

  const bottomTabs = ["activity", "tools", "delegations", "cron", "logs", "adapter_diagnostics"] as const;

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (idx + 1) % bottomTabs.length;
      setBottomTab(bottomTabs[next]);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (idx - 1 + bottomTabs.length) % bottomTabs.length;
      setBottomTab(bottomTabs[prev]);
    }
  }

  return (
    <div className="bottom-panel" role="region" aria-label="Bottom panel">
      <div className="bottom-tabs" role="tablist" aria-label="Bottom panel tabs">
        {bottomTabs.map((tab, idx) => (
          <button
            key={tab}
            role="tab"
            aria-selected={bottomTab === tab}
            aria-controls={`bottom-panel-${tab}`}
            id={`bottom-tab-${tab}`}
            tabIndex={bottomTab === tab ? 0 : -1}
            className={`bottom-tab ${bottomTab === tab ? "active" : ""}`}
            onClick={() => setBottomTab(tab)}
            onKeyDown={(e) => handleTabKeyDown(e, idx)}
          >
            {label(tab)}
          </button>
        ))}
      </div>
      <div className="bottom-content selectable" role="tabpanel" id={`bottom-panel-${bottomTab}`} aria-labelledby={`bottom-tab-${bottomTab}`}>
        {bottomTab === "activity" && <ActivityContent />}
        {bottomTab === "tools" && <ToolEventsContent />}
        {bottomTab === "delegations" && <DelegationsContent />}
        {bottomTab === "cron" && <CronContent />}
        {bottomTab === "logs" && <LogsContent />}
        {bottomTab === "adapter_diagnostics" && <AdapterDiagnosticsContent />}
      </div>
    </div>
  );
}

function ActivityContent() {
  const runs = useRunLedgerStore((s) => s.runs);
  const events = runs.flatMap((run) => run.events.map((event) => ({ run, event }))).slice(-80).reverse();

  if (events.length === 0) {
    return <div className="panel-note">Run activity will appear when a prompt starts.</div>;
  }

  return (
    <>
      {events.map(({ run, event }) => (
        <div key={event.id} className="log-line">
          <span className="timestamp">{formatTime(event.timestamp)}</span>
          <span style={{ color: "var(--app-text-muted)" }}>{run.runId}</span>{" "}
          <span style={{ color: "var(--app-text-secondary)" }}>{event.type}</span>
        </div>
      ))}
    </>
  );
}

function LogsContent() {
  const lines = useLogStore((s) => s.lines);
  const loaded = useLogStore((s) => s.loaded);
  const streaming = useLogStore((s) => s.streaming);
  const selectedSource = useLogStore((s) => s.selectedSource);
  const error = useLogStore((s) => s.error);
  const loadRecent = useLogStore((s) => s.loadRecent);
  const setSource = useLogStore((s) => s.setSource);
  const startStream = useLogStore((s) => s.startStream);
  const stopStream = useLogStore((s) => s.stopStream);
  const clear = useLogStore((s) => s.clear);
  const logEndRef = React.useRef<HTMLDivElement>(null);

  const sources = ["agent.log", "errors.log", "gateway.log"];

  React.useEffect(() => {
    loadRecent(selectedSource);
  }, []);

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--app-spacing-sm)", padding: "var(--app-spacing-xs) var(--app-spacing-sm)", borderBottom: "1px solid var(--app-border-subtle)", flexShrink: 0 }}>
        <label htmlFor="log-source-select" className="sr-only">Log source</label>
        <select
          id="log-source-select"
          value={selectedSource}
          onChange={(e) => setSource(e.target.value)}
          style={{ background: "var(--app-bg)", color: "var(--app-text)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-sm)", padding: "2px 6px", fontSize: "11px" }}
        >
          {sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          onClick={() => streaming ? stopStream() : startStream(selectedSource)}
          style={{ background: streaming ? "var(--app-danger)" : "var(--app-accent)", color: "#fff", border: "none", borderRadius: "var(--app-radius-sm)", padding: "2px 8px", fontSize: "11px", cursor: "pointer" }}
          aria-label={streaming ? "Stop log streaming" : "Start log streaming"}
        >
          {streaming ? "Stop" : "Stream"}
        </button>
        <button
          onClick={() => loadRecent(selectedSource)}
          style={{ background: "var(--app-surface-alt)", color: "var(--app-text-secondary)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-sm)", padding: "2px 8px", fontSize: "11px", cursor: "pointer" }}
          aria-label="Refresh logs"
        >
          Refresh
        </button>
        <button
          onClick={clear}
          style={{ background: "transparent", color: "var(--app-text-muted)", border: "none", padding: "2px 6px", fontSize: "11px", cursor: "pointer" }}
          aria-label="Clear log output"
        >
          Clear
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: "10px", color: "var(--app-text-muted)" }}>
          {lines.length} lines {streaming ? "· streaming" : ""}
        </span>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <div className="inline-error-actions">
            <button className="retry-button" onClick={() => loadRecent(selectedSource)} aria-label="Retry loading logs">Retry</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--app-spacing-xs)" }} role="log" aria-label="Log output" aria-live="polite">
        {!loaded && (
          <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center" }} role="status">Loading logs...</div>
        )}
        {loaded && lines.length === 0 && !error && (
          <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center" }} role="status">No log lines</div>
        )}
        {lines.map((line, i) => (
          <div key={i} className="log-line">
            {line.timestamp && <span className="timestamp">{line.timestamp}</span>}
            <span className={`level-${line.level}`}>[{line.level.toUpperCase()}]</span>{" "}
            <span>{line.message}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

function ToolEventsContent() {
  const runs = useRunLedgerStore((s) => s.runs);
  const tools = runs
    .flatMap((run) => run.events.map((event) => ({ run, event })))
    .filter(({ event }) => event.type.startsWith("tool."))
    .slice(-80)
    .reverse();

  if (tools.length === 0) {
    return <div className="panel-note">Tool start, progress, and completion events will appear here.</div>;
  }

  return (
    <>
      {tools.map(({ run, event }) => (
        <div key={event.id} className="log-line">
          <span className="timestamp">{formatTime(event.timestamp)}</span>
          <span>{run.runId}</span>{" "}
          <span className={event.type === "tool.completed" ? "level-info" : "level-warn"}>{event.type}</span>{" "}
          <span>{String(event.payload.tool ?? "tool")}</span>
        </div>
      ))}
    </>
  );
}

function AdapterDiagnosticsContent() {
  return (
    <RuntimeStatus />
  );
}

function DelegationsContent() {
  const delegations = useDelegationStore((s) => s.delegations);
  const loading = useDelegationStore((s) => s.loading);
  const loadDelegations = useDelegationStore((s) => s.loadDelegations);

  React.useEffect(() => {
    loadDelegations();
  }, []);

  if (loading && delegations.length === 0) {
    return <div className="panel-note" role="status">Loading delegations...</div>;
  }

  if (delegations.length === 0) {
    return <div className="panel-note">No sub-agent delegations found. Delegations appear when a run spawns child tasks.</div>;
  }

  return (
    <>
      {delegations.map((d) => (
        <div key={d.id} className="log-line">
          <span className="timestamp">{formatTime(d.started_at)}</span>
          <span className={`mini-status status-${d.status === "unknown" ? "idle" : d.status}`} />
          <span style={{ color: "var(--app-text-muted)" }}>{d.parent_run_id.slice(0, 12)}...</span>
          <span style={{ color: "var(--app-text-muted)" }}>→</span>
          <span style={{ color: "var(--app-text-secondary)" }}>{d.child_run_id.slice(0, 12)}...</span>
          <span style={{ color: "var(--app-text-muted)", marginLeft: "auto" }}>{d.tool_name}</span>
        </div>
      ))}
    </>
  );
}

function CronContent() {
  const jobs = useCronStore((s) => s.jobs);
  const loading = useCronStore((s) => s.loading);
  const loadJobs = useCronStore((s) => s.loadJobs);

  React.useEffect(() => {
    loadJobs();
  }, []);

  if (loading && jobs.length === 0) {
    return <div className="panel-note" role="status">Loading cron jobs...</div>;
  }

  if (jobs.length === 0) {
    return <div className="panel-note">No scheduled cron jobs found. Jobs defined in ~/.hermes/cron/ will appear here.</div>;
  }

  return (
    <>
      {jobs.map((job) => (
        <div key={job.id} className="log-line">
          <span className="timestamp">{job.last_run ? formatTime(job.last_run) : "—"}</span>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: job.status === "active" ? "var(--app-ok)" : job.status === "error" ? "var(--app-danger)" : "var(--app-text-muted)",
              display: "inline-block",
            }}
          />
          <span style={{ fontWeight: 600 }}>{job.name}</span>
          <span style={{ color: "var(--app-text-muted)" }}>{job.schedule_human}</span>
          {job.next_run && (
            <span style={{ color: "var(--app-text-muted)", marginLeft: "auto" }}>next: {formatTime(job.next_run)}</span>
          )}
        </div>
      ))}
    </>
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}
