import React from "react";
import type { ProcessInfo } from "../../api/studioClient";
import { useProcessStore } from "../../stores/processStore";

function formatUptime(startedAt: string, stoppedAt: string | null): string {
  const start = Date.parse(startedAt);
  const end = stoppedAt ? Date.parse(stoppedAt) : Date.now();
  if (Number.isNaN(start)) return "n/a";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

interface ProcessCardProps {
  process: ProcessInfo;
  isSelected: boolean;
  onSelect: () => void;
  onStop: () => void;
  onRemove: () => void;
  onCopyLogs: () => void;
  onCopyPid: () => void;
}

export function ProcessCard({ process, isSelected, onSelect, onStop, onRemove, onCopyLogs, onCopyPid }: ProcessCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const processLogs = useProcessStore((s) => s.processLogs[process.id] ?? []);
  const loadLogs = useProcessStore((s) => s.loadLogs);

  const statusColor =
    process.status === "running" ? "var(--app-ok)" :
    process.status === "error" ? "var(--app-danger)" :
    process.status === "starting" ? "var(--app-warn)" :
    "var(--app-text-muted)";

  const isRunning = process.status === "running";

  React.useEffect(() => {
    if (expanded && isRunning) {
      void loadLogs(process.id);
    }
  }, [expanded, isRunning, process.id, loadLogs]);

  return (
    <div className={`process-card ${isSelected ? "selected" : ""} ${process.status}`} onClick={onSelect}>
      <div className="process-card-header">
        <div className="process-card-info">
          <span className="status-dot" style={{ background: statusColor }} />
          <span className="process-card-name">{process.name}</span>
          <span className={`status-pill status-${process.status}`}>{process.status}</span>
        </div>
        <div className="process-card-actions">
          {isRunning && (
            <button className="tool-button danger" onClick={(e) => { e.stopPropagation(); onStop(); }}>
              Stop
            </button>
          )}
          {!isRunning && process.status !== "starting" && (
            <button className="tool-button" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
              Remove
            </button>
          )}
          <button className="tool-button" onClick={(e) => { e.stopPropagation(); onCopyPid(); }} disabled={!process.pid}>
            PID
          </button>
          <button className="tool-button" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? "Hide Logs" : "Logs"}
          </button>
        </div>
      </div>
      <div className="process-card-meta">
        <span>{process.command}</span>
        {process.pid && <span>PID: {process.pid}</span>}
        <span>Started: {formatTime(process.started_at)}</span>
        {process.stopped_at && <span>Stopped: {formatTime(process.stopped_at)}</span>}
        <span>Uptime: {formatUptime(process.started_at, process.stopped_at)}</span>
        {process.exit_code !== null && <span>Exit: {process.exit_code}</span>}
        {process.error && <span className="process-error">Error: {process.error}</span>}
      </div>
      {expanded && (
        <div className="process-card-logs selectable" onClick={(e) => e.stopPropagation()}>
          <div className="process-log-actions">
            <button className="tool-button" onClick={() => void loadLogs(process.id, 500)}>Refresh Logs</button>
            <button className="tool-button" onClick={onCopyLogs}>Copy Logs</button>
          </div>
          <pre className="process-log-output">
            {processLogs.length > 0
              ? processLogs.join("\n")
              : "No log output captured yet."}
          </pre>
        </div>
      )}
    </div>
  );
}
