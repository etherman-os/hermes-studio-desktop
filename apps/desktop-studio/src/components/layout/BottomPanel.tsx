import React from "react";
import { useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { useLogStore } from "../../stores/logStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";
import { useAdapterStore } from "../../stores/adapterStore";

export function BottomPanel() {
  const bottomTab = useLayoutStore((s) => s.bottomTab);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const label = useThemeStore((s) => s.label);

  return (
    <div className="bottom-panel">
      <div className="bottom-tabs">
        {(["activity", "tools", "logs", "adapter_diagnostics"] as const).map((tab) => (
          <button
            key={tab}
            className={`bottom-tab ${bottomTab === tab ? "active" : ""}`}
            onClick={() => setBottomTab(tab)}
          >
            {label(tab)}
          </button>
        ))}
      </div>
      <div className="bottom-content selectable">
        {bottomTab === "activity" && <ActivityContent />}
        {bottomTab === "tools" && <ToolEventsContent />}
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
      {/* Source selector + controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--app-spacing-sm)", padding: "var(--app-spacing-xs) var(--app-spacing-sm)", borderBottom: "1px solid var(--app-border-subtle)", flexShrink: 0 }}>
        <select
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
        >
          {streaming ? "Stop" : "Stream"}
        </button>
        <button
          onClick={() => loadRecent(selectedSource)}
          style={{ background: "var(--app-surface-alt)", color: "var(--app-text-secondary)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-sm)", padding: "2px 8px", fontSize: "11px", cursor: "pointer" }}
        >
          Refresh
        </button>
        <button
          onClick={clear}
          style={{ background: "transparent", color: "var(--app-text-muted)", border: "none", padding: "2px 6px", fontSize: "11px", cursor: "pointer" }}
        >
          Clear
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: "10px", color: "var(--app-text-muted)" }}>
          {lines.length} lines {streaming ? "· streaming" : ""}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "var(--app-spacing-xs) var(--app-spacing-sm)", fontSize: "11px", color: "var(--app-danger)", background: "rgba(248,81,73,0.1)" }}>
          {error}
        </div>
      )}

      {/* Log lines */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--app-spacing-xs)" }}>
        {!loaded && (
          <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center" }}>Loading logs...</div>
        )}
        {loaded && lines.length === 0 && !error && (
          <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center" }}>No log lines</div>
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
  const connected = useAdapterStore((s) => s.connected);
  const checking = useAdapterStore((s) => s.checking);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const activeBackend = useAdapterStore((s) => s.activeBackend);
  const hermesConnected = useAdapterStore((s) => s.hermesConnected);
  const authError = useAdapterStore((s) => s.authError);
  const fallbackReason = useAdapterStore((s) => s.fallbackReason);

  return (
    <div className="diagnostics-grid">
      <div><span>Adapter</span><strong>{checking ? "checking" : connected ? "connected" : "disconnected"}</strong></div>
      <div><span>Backend mode</span><strong>{backendMode}</strong></div>
      <div><span>Active backend</span><strong>{activeBackend}</strong></div>
      <div><span>Hermes</span><strong>{hermesConnected ? "reachable" : "not reachable"}</strong></div>
      {(authError || fallbackReason) && <div className="diagnostics-wide"><span>Notice</span><strong>{authError ?? fallbackReason}</strong></div>}
    </div>
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}
