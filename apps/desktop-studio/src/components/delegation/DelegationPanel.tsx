import React from "react";
import { useDelegationStore } from "../../stores/delegationStore";
import { useLayoutStore } from "../../stores/layoutStore";

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const className = `mini-status status-${status === "unknown" ? "idle" : status}`;
  return <span className={className} />;
}

export function DelegationPanel() {
  const delegations = useDelegationStore((s) => s.delegations);
  const selectedId = useDelegationStore((s) => s.selectedDelegationId);
  const selectedDetail = useDelegationStore((s) => s.selectedDelegation);
  const loading = useDelegationStore((s) => s.loading);
  const error = useDelegationStore((s) => s.error);
  const loadDelegations = useDelegationStore((s) => s.loadDelegations);
  const selectDelegation = useDelegationStore((s) => s.selectDelegation);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);

  React.useEffect(() => {
    loadDelegations();
  }, []);

  return (
    <div className="delegation-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
          {delegations.length} delegation{delegations.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => loadDelegations()}
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
          aria-label="Refresh delegations"
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="inline-error" role="alert" style={{ margin: "var(--app-spacing-xs)" }}>
          <span>{error}</span>
          <div className="inline-error-actions">
            <button className="retry-button" onClick={() => loadDelegations()} aria-label="Retry loading delegations">
              Retry
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--app-spacing-xs)" }}>
        {loading && delegations.length === 0 && (
          <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center" }} role="status">
            Loading delegations...
          </div>
        )}

        {!loading && delegations.length === 0 && !error && (
          <div className="empty-state" style={{ padding: "var(--app-spacing-md)" }}>
            <div className="empty-state-icon" aria-hidden="true">D</div>
            <div className="empty-state-text">No delegations found</div>
            <div className="sidebar-note" style={{ marginTop: "var(--app-spacing-xs)" }}>
              Sub-agent delegations will appear here when a run spawns child tasks.
            </div>
          </div>
        )}

        {delegations.map((delegation) => (
          <button
            key={delegation.id}
            className={`sidebar-item ${selectedId === delegation.id ? "active" : ""}`}
            onClick={() => selectDelegation(delegation.id)}
            style={{ flexDirection: "column", alignItems: "stretch", padding: "var(--app-spacing-sm)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--app-spacing-sm)" }}>
              <StatusBadge status={delegation.status} />
              <span style={{ fontSize: "11px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {delegation.tool_name}
              </span>
              <span style={{ fontSize: "10px", color: "var(--app-text-muted)", flexShrink: 0 }}>
                {formatDuration(delegation.duration_ms)}
              </span>
            </div>
            <div style={{ display: "flex", gap: "var(--app-spacing-sm)", fontSize: "10px", color: "var(--app-text-muted)", marginTop: "2px" }}>
              <span title={delegation.parent_run_id}>parent: {delegation.parent_run_id.slice(0, 12)}...</span>
              <span>→</span>
              <span title={delegation.child_run_id}>child: {delegation.child_run_id.slice(0, 12)}...</span>
            </div>
          </button>
        ))}
      </div>

      {selectedDetail && (
        <div
          style={{
            borderTop: "1px solid var(--app-border-subtle)",
            padding: "var(--app-spacing-sm)",
            flexShrink: 0,
            maxHeight: "40%",
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--app-text-muted)", marginBottom: "var(--app-spacing-xs)" }}>
            Delegation Detail
          </div>
          <DelegationDetailContent detail={selectedDetail} onNavigateToRun={(runId) => {
            setBottomTab("activity");
          }} />
        </div>
      )}
    </div>
  );
}

function DelegationDetailContent({
  detail,
  onNavigateToRun,
}: {
  detail: import("../../api/studioClient").DelegationDetail;
  onNavigateToRun: (runId: string) => void;
}) {
  return (
    <div style={{ fontSize: "11px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--app-spacing-sm)", marginBottom: "var(--app-spacing-xs)" }}>
        <StatusBadge status={detail.status} />
        <span style={{ fontWeight: 600 }}>{detail.tool_name}</span>
        <span style={{ color: "var(--app-text-muted)" }}>{detail.status}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px var(--app-spacing-sm)", color: "var(--app-text-secondary)" }}>
        <span style={{ color: "var(--app-text-muted)" }}>Started:</span>
        <span>{formatTime(detail.started_at)}</span>
        <span style={{ color: "var(--app-text-muted)" }}>Duration:</span>
        <span>{formatDuration(detail.duration_ms)}</span>
      </div>

      {detail.parent_run && (
        <div style={{ marginTop: "var(--app-spacing-sm)" }}>
          <div style={{ fontSize: "10px", color: "var(--app-text-muted)", marginBottom: "2px" }}>Parent Run</div>
          <button
            className="sidebar-item"
            onClick={() => onNavigateToRun(detail.parent_run_id)}
            style={{ padding: "2px var(--app-spacing-xs)", fontSize: "11px" }}
          >
            <StatusBadge status={detail.parent_run.status} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {detail.parent_run.title || detail.parent_run_id}
            </span>
          </button>
        </div>
      )}

      {detail.child_run && (
        <div style={{ marginTop: "var(--app-spacing-sm)" }}>
          <div style={{ fontSize: "10px", color: "var(--app-text-muted)", marginBottom: "2px" }}>Child Run</div>
          <button
            className="sidebar-item"
            onClick={() => onNavigateToRun(detail.child_run_id)}
            style={{ padding: "2px var(--app-spacing-xs)", fontSize: "11px" }}
          >
            <StatusBadge status={detail.child_run.status} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {detail.child_run.title || detail.child_run_id}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
