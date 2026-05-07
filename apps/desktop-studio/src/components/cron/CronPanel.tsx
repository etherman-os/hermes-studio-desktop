import React from "react";
import { useCronStore } from "../../stores/cronStore";
import type { CronJob, CronJobStatus } from "../../api/studioClient";

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function statusColor(status: CronJobStatus): string {
  switch (status) {
    case "active": return "var(--app-ok)";
    case "paused": return "var(--app-warn)";
    case "error": return "var(--app-danger)";
    case "disabled": return "var(--app-text-muted)";
    default: return "var(--app-text-muted)";
  }
}

function StatusBadge({ status }: { status: CronJobStatus }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "10px",
        fontWeight: 600,
        color: statusColor(status),
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: statusColor(status),
        }}
        aria-hidden="true"
      />
      {status}
    </span>
  );
}

export function CronPanel() {
  const jobs = useCronStore((s) => s.jobs);
  const selectedId = useCronStore((s) => s.selectedJobId);
  const loading = useCronStore((s) => s.loading);
  const error = useCronStore((s) => s.error);
  const loadJobs = useCronStore((s) => s.loadJobs);
  const selectJob = useCronStore((s) => s.selectJob);

  React.useEffect(() => {
    loadJobs();
  }, []);

  return (
    <div className="cron-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--app-spacing-sm)",
          padding: "var(--app-spacing-xs) var(--app-spacing-sm)",
          borderBottom: "1px solid var(--app-border-subtle)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--app-text-muted)", flex: 1 }}>
          {jobs.length} job{jobs.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => loadJobs()}
          disabled={loading}
          style={{
            background: "var(--app-surface-alt)",
            color: "var(--app-text-secondary)",
            border: "1px solid var(--app-border)",
            borderRadius: "var(--app-radius-sm)",
            padding: "2px 8px",
            fontSize: "11px",
            cursor: loading ? "default" : "pointer",
          }}
          aria-label="Refresh cron jobs"
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="inline-error" role="alert" style={{ margin: "var(--app-spacing-xs)" }}>
          <span>{error}</span>
          <div className="inline-error-actions">
            <button className="retry-button" onClick={() => loadJobs()} aria-label="Retry loading cron jobs">
              Retry
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--app-spacing-xs)" }}>
        {loading && jobs.length === 0 && (
          <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center" }} role="status">
            Loading cron jobs...
          </div>
        )}

        {!loading && jobs.length === 0 && !error && (
          <div className="empty-state" style={{ padding: "var(--app-spacing-md)" }}>
            <div className="empty-state-icon" aria-hidden="true">C</div>
            <div className="empty-state-text">No scheduled jobs</div>
            <div className="sidebar-note" style={{ marginTop: "var(--app-spacing-xs)" }}>
              Cron jobs defined in ~/.hermes/cron/ will appear here.
            </div>
          </div>
        )}

        {jobs.map((job) => (
          <CronJobRow
            key={job.id}
            job={job}
            isSelected={selectedId === job.id}
            onSelect={() => selectJob(job.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CronJobRow({
  job,
  isSelected,
  onSelect,
}: {
  job: CronJob;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={`sidebar-item ${isSelected ? "active" : ""}`}
      onClick={onSelect}
      style={{ flexDirection: "column", alignItems: "stretch", padding: "var(--app-spacing-sm)", cursor: "pointer" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--app-spacing-sm)" }}>
        <StatusBadge status={job.status} />
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {job.name}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--app-text-muted)",
            cursor: "pointer",
            fontSize: "10px",
            padding: "2px 4px",
          }}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          aria-expanded={expanded}
        >
          {expanded ? "▼" : "▶"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: "var(--app-spacing-sm)",
          fontSize: "10px",
          color: "var(--app-text-muted)",
          marginTop: "2px",
        }}
      >
        <span>{job.schedule_human}</span>
        {job.last_run && <span>· last: {formatTime(job.last_run)}</span>}
      </div>

      {expanded && (
        <div
          style={{
            marginTop: "var(--app-spacing-sm)",
            padding: "var(--app-spacing-xs)",
            background: "var(--app-bg)",
            borderRadius: "var(--app-radius-sm)",
            fontSize: "11px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {job.description && (
            <div style={{ marginBottom: "var(--app-spacing-xs)", color: "var(--app-text-secondary)" }}>
              {job.description}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px var(--app-spacing-sm)", color: "var(--app-text-secondary)" }}>
            <span style={{ color: "var(--app-text-muted)" }}>Schedule:</span>
            <span>{job.schedule || "—"}</span>
            <span style={{ color: "var(--app-text-muted)" }}>Command:</span>
            <span style={{ fontFamily: "var(--app-font-mono)", wordBreak: "break-all" }}>{job.command || "—"}</span>
            <span style={{ color: "var(--app-text-muted)" }}>Next run:</span>
            <span>{formatTime(job.next_run)}</span>
            <span style={{ color: "var(--app-text-muted)" }}>Source:</span>
            <span>{job.source_file}</span>
          </div>
          <div style={{ marginTop: "var(--app-spacing-sm)", display: "flex", gap: "var(--app-spacing-sm)" }}>
            <button
              disabled
              title="Run Now is not available in v1"
              style={{
                background: "var(--app-surface-alt)",
                color: "var(--app-text-muted)",
                border: "1px solid var(--app-border)",
                borderRadius: "var(--app-radius-sm)",
                padding: "2px 8px",
                fontSize: "10px",
                cursor: "not-allowed",
              }}
            >
              Run Now (v2)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
