import React from "react";
import { useCronStore } from "../../stores/cronStore";
import type { CronJob, CronJobStatus } from "../../api/studioClient";

// -----------------------------------------------------------------------------------------------
// Schedule helpers
// -----------------------------------------------------------------------------------------------

const SCHEDULE_PRESETS = [
  { label: "Every 5 minutes",    value: "*/5 * * * *" },
  { label: "Every 15 minutes",   value: "*/15 * * * *" },
  { label: "Every 30 minutes",   value: "*/30 * * * *" },
  { label: "Every hour",         value: "0 * * * *" },
  { label: "Every 2 hours",      value: "0 */2 * * *" },
  { label: "Daily at midnight",   value: "0 0 * * *" },
  { label: "Daily at 2am",       value: "0 2 * * *" },
  { label: "Weekly (Sunday)",     value: "0 0 * * 0" },
  { label: "Monthly (1st)",      value: "0 0 1 * *" },
];

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusColor(status: CronJobStatus): string {
  switch (status) {
    case "active":  return "var(--app-ok)";
    case "paused":  return "var(--app-warn)";
    case "error":   return "var(--app-danger)";
    case "disabled": return "var(--app-text-muted)";
    default:        return "var(--app-text-muted)";
  }
}

function StatusBadge({ status }: { status: CronJobStatus }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 600, color: statusColor(status), textTransform: "uppercase",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: statusColor(status),
      }} aria-hidden="true" />
      {status}
    </span>
  );
}

// -----------------------------------------------------------------------------------------------
// Create / edit form
// -----------------------------------------------------------------------------------------------

interface CronFormState {
  name: string;
  schedule: string;
  command: string;
  description: string;
}

interface CronFormProps {
  initial?: CronFormState;
  onSubmit: (data: CronFormState) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

function CronForm({ initial, onSubmit, onCancel, submitLabel = "Create" }: CronFormProps) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [schedule, setSchedule] = React.useState(initial?.schedule ?? "*/5 * * * *");
  const [command, setCommand] = React.useState(initial?.command ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const preset = SCHEDULE_PRESETS.find((p) => p.value === schedule);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !schedule.trim() || !command.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), schedule: schedule.trim(), command: command.trim(), description: description.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--app-spacing-sm)" }}>
      {error && <div className="inline-error" role="alert"><span>{error}</span></div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--app-spacing-sm)" }}>
        <div>
          <label style={labelStyle}>Job Name *</label>
          <input
            className="studio-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Daily workspace cleanup"
            required
            aria-label="Cron job name"
          />
        </div>
        <div>
          <label style={labelStyle}>Schedule *</label>
          <div style={{ display: "flex", gap: "var(--app-spacing-xs)", alignItems: "center" }}>
            <input
              className="studio-input"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="*/5 * * * *"
              required
              aria-label="Cron expression"
              style={{ flex: 1 }}
            />
            {preset && <span style={{ fontSize: 11, color: "var(--app-text-muted)", whiteSpace: "nowrap" }}>{preset.label}</span>}
          </div>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Schedule Preset</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: 2 }}>
          {SCHEDULE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setSchedule(p.value)}
              style={{
                padding: "2px 8px",
                fontSize: 10,
                borderRadius: "var(--app-radius-sm)",
                border: "1px solid",
                borderColor: schedule === p.value ? "var(--app-accent)" : "var(--app-border)",
                background: schedule === p.value ? "var(--app-accent-subtle)" : "var(--app-surface-alt)",
                color: schedule === p.value ? "var(--app-accent)" : "var(--app-text-secondary)",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Hermes Command / Prompt *</label>
        <textarea
          className="studio-input"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="e.g. Analyze my git log and summarize recent changes, or: hermes chat 'What meetings do I have tomorrow?'"
          required
          rows={3}
          style={{ resize: "vertical", fontFamily: "var(--app-font-mono)", fontSize: 12 }}
          aria-label="Command to run"
        />
        <div style={{ fontSize: 10, color: "var(--app-text-muted)", marginTop: 2 }}>
          Enter a natural-language prompt or hermes command. This is passed to Hermes as a task.
        </div>
      </div>

      <div>
        <label style={labelStyle}>Description <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input
          className="studio-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of what this job does"
          aria-label="Job description"
        />
      </div>

      <div style={{ display: "flex", gap: "var(--app-spacing-sm)", justifyContent: "flex-end", marginTop: "var(--app-spacing-xs)" }}>
        <button type="button" className="tool-button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary-button" disabled={saving || !name.trim() || !schedule.trim() || !command.trim()}>
          {saving ? "Creating..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------------------------
// Main CronSurface
// -----------------------------------------------------------------------------------------------

export function CronSurface() {
  const jobs = useCronStore((s) => s.jobs);
  const selectedId = useCronStore((s) => s.selectedJobId);
  const loading = useCronStore((s) => s.loading);
  const error = useCronStore((s) => s.error);
  const loadJobs = useCronStore((s) => s.loadJobs);
  const selectJob = useCronStore((s) => s.selectJob);

  const [showCreate, setShowCreate] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deletingError, setDeletingError] = React.useState<string | null>(null);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  React.useEffect(() => { loadJobs(); }, [loadJobs]);

  async function handleCreate(data: CronFormState) {
    // Create via Hermes CLI (hermes cron create <name> <schedule> <command>)
    const args = [data.name, data.schedule, data.command];
    if (data.description) args.push("--description", data.description);
    const result = await invokeHermesCli(["cron", "create", ...args]);
    if (!result.ok) throw new Error(result.error ?? "Failed to create cron job");
    setShowCreate(false);
    await loadJobs();
  }

  async function handleDelete(jobId: string) {
    setDeletingId(jobId);
    setDeletingError(null);
    setActionLoading(jobId);
    try {
      const result = await invokeHermesCli(["cron", "remove", jobId, "--yes"]);
      if (!result.ok) throw new Error(result.error ?? "Failed to delete cron job");
      setDeletingId(null);
      if (selectedId === jobId) selectJob(null);
      await loadJobs();
    } catch (err) {
      setDeletingError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
      setActionLoading(null);
    }
  }

  async function handleToggleEnabled(job: CronJob) {
    setActionLoading(job.id);
    try {
      const cmd = job.enabled ? ["cron", "pause", job.id] : ["cron", "resume", job.id];
      const result = await invokeHermesCli(cmd);
      if (!result.ok) throw new Error(result.error ?? `Failed to ${job.enabled ? "pause" : "resume"} job`);
      await loadJobs();
    } catch (err) {
      // Could show toast, but store doesn't support partial errors
      console.error("toggle enabled failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="cron-surface" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div className="extensions-header">
        <div>
          <div className="workbench-eyebrow">Automate</div>
          <h2>Scheduled Jobs</h2>
        </div>
        <button className="primary-button" onClick={() => setShowCreate(true)} aria-label="Create cron job">
          + New Job
        </button>
      </div>

      {/* Error banner */}
      {(error || deletingError) && (
        <div className="inline-error" role="alert" style={{ margin: "var(--app-spacing-xs) var(--app-spacing-sm)" }}>
          <span>{error || deletingError}</span>
          <button className="retry-button" onClick={deletingError ? () => setDeletingError(null) : () => void loadJobs()}>Dismiss</button>
        </div>
      )}

      {/* Create form overlay */}
      {showCreate && (
        <div style={{
          borderBottom: "1px solid var(--app-border-subtle)",
          padding: "var(--app-spacing-sm)",
          background: "var(--app-surface-alt)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--app-text-muted)", marginBottom: "var(--app-spacing-sm)" }}>
            Create New Cron Job
          </div>
          <CronForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            submitLabel="Create"
          />
        </div>
      )}

      {/* Job list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--app-spacing-xs) var(--app-spacing-sm)" }}>
        {loading && jobs.length === 0 && (
          <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center" }} role="status">
            Loading cron jobs...
          </div>
        )}

        {!loading && jobs.length === 0 && !error && (
          <div className="empty-state" style={{ padding: "var(--app-spacing-md)", marginTop: "2rem" }}>
            <div className="empty-state-icon" aria-hidden="true">C</div>
            <div className="empty-state-text">No scheduled jobs</div>
            <div className="sidebar-note" style={{ marginTop: "var(--app-spacing-xs)" }}>
              Jobs defined in ~/.hermes/cron/ will appear here. Create one to get started.
            </div>
            <button className="primary-button" style={{ marginTop: "var(--app-spacing-sm)" }} onClick={() => setShowCreate(true)}>
              Create First Job
            </button>
          </div>
        )}

        {jobs.map((job) => (
          <CronJobCard
            key={job.id}
            job={job}
            isSelected={selectedId === job.id}
            onSelect={() => selectJob(job.id)}
            onToggle={() => void handleToggleEnabled(job)}
            onDelete={() => void handleDelete(job.id)}
            deleting={deletingId === job.id}
            actionLoading={actionLoading === job.id}
          />
        ))}
      </div>

      {/* Stats footer */}
      {jobs.length > 0 && (
        <div style={{
          borderTop: "1px solid var(--app-border-subtle)",
          padding: "var(--app-spacing-xs) var(--app-spacing-sm)",
          fontSize: 10,
          color: "var(--app-text-muted)",
          flexShrink: 0,
        }}>
          {jobs.length} job{jobs.length !== 1 ? "s" : ""} · source: ~/.hermes/cron/
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------------------
// CronJobCard
// -----------------------------------------------------------------------------------------------

interface CronJobCardProps {
  job: CronJob;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  deleting: boolean;
  actionLoading: boolean;
}

function CronJobCard({ job, isSelected, onSelect, onToggle, onDelete, deleting, actionLoading }: CronJobCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={`sidebar-item ${isSelected ? "active" : ""}`}
      onClick={onSelect}
      style={{ flexDirection: "column", alignItems: "stretch", padding: "var(--app-spacing-sm)", cursor: "pointer", marginBottom: "var(--app-spacing-xs)" }}
    >
      {/* Row 1: status, name, toggle, expand */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--app-spacing-sm)" }}>
        <StatusBadge status={job.status} />
        <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {job.name}
        </span>

        {/* Toggle enabled/disabled */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          disabled={actionLoading}
          title={job.enabled ? "Pause job" : "Resume job"}
          style={{
            display: "flex", alignItems: "center", gap: 3,
            background: job.enabled ? "rgba(63,185,80,0.15)" : "rgba(139,92,246,0.15)",
            border: "1px solid",
            borderColor: job.enabled ? "rgba(63,185,80,0.4)" : "rgba(139,92,246,0.4)",
            borderRadius: "var(--app-radius-sm)",
            padding: "2px 7px",
            fontSize: 10, fontWeight: 600,
            color: job.enabled ? "var(--app-ok)" : "var(--mode-manage-accent)",
            cursor: actionLoading ? "default" : "pointer",
            opacity: actionLoading ? 0.6 : 1,
          }}
        >
          {actionLoading ? "..." : job.enabled ? "Pause" : "Resume"}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          style={{
            background: "transparent", border: "none", color: "var(--app-text-muted)",
            cursor: "pointer", fontSize: 10, padding: "2px 4px",
          }}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          aria-expanded={expanded}
        >
          {expanded ? "▼" : "▶"}
        </button>
      </div>

      {/* Row 2: schedule + next run */}
      <div style={{ display: "flex", gap: "var(--app-spacing-sm)", fontSize: 11, color: "var(--app-text-muted)", marginTop: 3 }}>
        <span style={{ fontFamily: "var(--app-font-mono)" }}>{job.schedule_human}</span>
        {job.next_run && <span>· next: {formatTime(job.next_run)}</span>}
        {job.last_run && <span>· last: {formatTime(job.last_run)}</span>}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            marginTop: "var(--app-spacing-sm)", padding: "var(--app-spacing-sm)",
            background: "var(--app-bg)", borderRadius: "var(--app-radius-sm)",
            fontSize: 11,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {job.description && (
            <div style={{ color: "var(--app-text-secondary)", marginBottom: "var(--app-spacing-sm)" }}>
              {job.description}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px var(--app-spacing-sm)", color: "var(--app-text-secondary)" }}>
            <span style={{ color: "var(--app-text-muted)" }}>Schedule:</span>
            <span style={{ fontFamily: "var(--app-font-mono)" }}>{job.schedule || "—"}</span>

            <span style={{ color: "var(--app-text-muted)" }}>Command:</span>
            <span style={{ fontFamily: "var(--app-font-mono)", wordBreak: "break-all" }}>{job.command || "—"}</span>

            <span style={{ color: "var(--app-text-muted)" }}>Next run:</span>
            <span>{formatTime(job.next_run)}</span>

            <span style={{ color: "var(--app-text-muted)" }}>Source:</span>
            <span>{job.source_file}</span>
          </div>

          <div style={{ marginTop: "var(--app-spacing-sm)", display: "flex", gap: "var(--app-spacing-sm)", flexWrap: "wrap" }}>
            <button
              onClick={() => void invokeHermesCli(["cron", "run", job.id])}
              style={{
                background: "var(--app-surface-alt)", color: "var(--app-accent)",
                border: "1px solid var(--app-accent)", borderRadius: "var(--app-radius-sm)",
                padding: "2px 8px", fontSize: 10, cursor: "pointer",
              }}
            >
              Run Now
            </button>

            <button
              onClick={onDelete}
              disabled={deleting}
              style={{
                background: "var(--app-surface-alt)", color: "var(--app-danger)",
                border: "1px solid var(--app-danger)", borderRadius: "var(--app-radius-sm)",
                padding: "2px 8px", fontSize: 10, cursor: deleting ? "default" : "pointer",
                opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------------------
// Hermès CLI invocation helper
// -----------------------------------------------------------------------------------------------

interface CliResult { ok: boolean; output?: string; error?: string; }

async function invokeHermesCli(args: string[]): Promise<CliResult> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<string>("run_hermes_cli", { args });
    return { ok: true, output: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// -----------------------------------------------------------------------------------------------
// Shared styles
// -----------------------------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "var(--app-text-secondary)", marginBottom: 3,
};