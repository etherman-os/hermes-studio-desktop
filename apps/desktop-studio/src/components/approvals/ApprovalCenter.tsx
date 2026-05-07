import React from "react";
import type { Approval } from "../../api/studioClient";
import { useApprovalStore } from "../../stores/approvalStore";
import { useContextStore } from "../../stores/contextStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";
import { useSessionStore } from "../../stores/sessionStore";

interface ApprovalCenterProps {
  compact?: boolean;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "denied", label: "Denied" },
  { id: "high_risk", label: "High risk" },
] as const;

function formatTime(iso: string | null) {
  if (!iso) return "n/a";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function approvalTitle(approval: Approval) {
  return approval.tool_name ?? approval.command ?? approval.id;
}

function riskTone(approval: Approval) {
  if (approval.risk_level === "critical") return "critical";
  if (approval.risk_level === "high") return "high";
  if (approval.risk_level === "medium") return "medium";
  return "low";
}

function payloadPreview(payload: Record<string, unknown> | null) {
  if (!payload) return "{}";
  return JSON.stringify(payload, null, 2);
}

export function ApprovalCenter({ compact = false }: ApprovalCenterProps) {
  const approvals = useApprovalStore((s) => s.approvals);
  const pending = useApprovalStore((s) => s.pending);
  const selectedApproval = useApprovalStore((s) => s.selectedApproval);
  const selectedApprovalId = useApprovalStore((s) => s.selectedApprovalId);
  const filter = useApprovalStore((s) => s.filter);
  const loading = useApprovalStore((s) => s.loading);
  const error = useApprovalStore((s) => s.error);
  const actionMessage = useApprovalStore((s) => s.actionMessage);
  const loadApprovals = useApprovalStore((s) => s.loadApprovals);
  const loadPendingApprovals = useApprovalStore((s) => s.loadPendingApprovals);
  const loadApprovalDetail = useApprovalStore((s) => s.loadApprovalDetail);
  const setFilter = useApprovalStore((s) => s.setFilter);
  const clearActionMessage = useApprovalStore((s) => s.clearActionMessage);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const selectRun = useRunLedgerStore((s) => s.selectRun);
  const loadRunContext = useContextStore((s) => s.loadRunContext);
  const loadSessionContext = useContextStore((s) => s.loadSessionContext);
  const hasLoadedRef = React.useRef(false);

  React.useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void loadPendingApprovals();
    void loadApprovals();
  }, [loadApprovals, loadPendingApprovals]);

  const list = compact ? pending.slice(0, 5) : approvals;
  const selected = selectedApproval ?? approvals.find((approval) => approval.id === selectedApprovalId) ?? list[0] ?? null;

  function openRun(runId: string | null) {
    if (!runId) return;
    selectRun(runId);
    setActiveTab("runs");
  }

  function openSession(sessionId: string | null) {
    if (!sessionId) return;
    setActiveSession(sessionId);
    setActiveTab("sessions");
  }

  async function inspectContext(approval: Approval) {
    if (approval.run_id) {
      await loadRunContext(approval.run_id);
      return;
    }
    if (approval.session_id) {
      await loadSessionContext(approval.session_id);
    }
  }

  return (
    <div className={`approval-center ${compact ? "compact" : ""}`} role="region" aria-label="Approval center">
      {!compact && (
        <div className="approval-header">
          <div>
            <div className="workbench-eyebrow">Approval Center</div>
            <h2>Pending and historical tool approvals</h2>
          </div>
          <button className="tool-button" onClick={() => {
            void loadPendingApprovals();
            void loadApprovals();
          }} aria-label="Refresh approvals">
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      )}

      <div className="approval-readonly-note" role="note">
        Approval response is not wired yet. This view is read-only and does not bypass Hermes approval mechanisms.
      </div>

      {!compact && (
        <div className="approval-filter-row" role="group" aria-label="Filter approvals">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              role="radio"
              aria-checked={filter === item.id}
              className={`segmented-button ${filter === item.id ? "active" : ""}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {error && <div className="run-ledger-notice warning" role="alert">Approvals unavailable: {error}</div>}
      {actionMessage && !compact && (
        <div className="run-ledger-notice" role="status">
          <span>{actionMessage}</span>
          <button className="link-button" onClick={clearActionMessage}>Dismiss</button>
        </div>
      )}

      {pending.length > 0 && !compact && (
        <section className="approval-section">
          <div className="context-section-title">Pending</div>
          <div className="approval-list" role="listbox" aria-label="Pending approvals">
            {pending.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                active={selected?.id === approval.id}
                onClick={() => void loadApprovalDetail(approval.id)}
              />
            ))}
          </div>
        </section>
      )}

      <div className="approval-body">
        <div className="approval-list" role="listbox" aria-label="All approvals">
          {loading && list.length === 0 && <div className="workbench-empty compact" role="status">Loading approvals...</div>}
          {!loading && list.length === 0 && (
            <div className="workbench-empty compact">
              No approvals captured yet. Tool approval requests from run streams will appear here for audit.
            </div>
          )}
          {list.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              active={selected?.id === approval.id}
              onClick={() => void loadApprovalDetail(approval.id)}
            />
          ))}
        </div>

        {!compact && (
          <div className="approval-detail">
            {selected ? (
              <>
                <div className="event-detail-header">
                  <div>
                    <div className="workbench-eyebrow">Approval Detail</div>
                    <div className="event-detail-title">{approvalTitle(selected)}</div>
                  </div>
                  <span className={`approval-risk ${riskTone(selected)}`}>{selected.risk_level}</span>
                </div>
                <dl className="event-detail-meta">
                  <dt>Status</dt>
                  <dd>{selected.status}</dd>
                  <dt>Decision</dt>
                  <dd>{selected.decision ?? "none"}</dd>
                  <dt>Tool</dt>
                  <dd>{selected.tool_name ?? "unknown"}</dd>
                  <dt>Command/action</dt>
                  <dd>{selected.command ?? "unknown"}</dd>
                  <dt>Run</dt>
                  <dd>{selected.run_id ?? "none"}</dd>
                  <dt>Session</dt>
                  <dd>{selected.session_id ?? "none"}</dd>
                  <dt>Created</dt>
                  <dd>{formatTime(selected.created_at)}</dd>
                  <dt>Decided</dt>
                  <dd>{formatTime(selected.decided_at)}</dd>
                </dl>
                {selected.reason && <div className="panel-note">Reason: {selected.reason}</div>}
                <div className="approval-actions">
                  <button className="tool-button" onClick={() => openRun(selected.run_id)} disabled={!selected.run_id}>Open Run</button>
                  <button className="tool-button" onClick={() => openSession(selected.session_id)} disabled={!selected.session_id}>Open Session</button>
                  <button className="tool-button" onClick={() => void inspectContext(selected)} disabled={!selected.run_id && !selected.session_id}>
                    Inspect Context
                  </button>
                </div>
                <pre className="event-payload">{payloadPreview(selectedApproval?.request_payload ?? null)}</pre>
              </>
            ) : (
              <div className="workbench-empty compact">Select an approval to inspect request details.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalCard({ approval, active, onClick }: { approval: Approval; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`approval-card ${active ? "active" : ""} ${approval.status}`}
      onClick={onClick}
      role="option"
      aria-selected={active}
      aria-label={`${approvalTitle(approval)} - ${approval.status} - risk ${approval.risk_level}`}
    >
      <span className={`approval-risk ${riskTone(approval)}`}>{approval.risk_level}</span>
      <span className="approval-card-main">
        <span className="approval-card-title">{approvalTitle(approval)}</span>
        <span className="approval-card-meta">
          {approval.status}
          {approval.run_id ? ` - ${approval.run_id}` : ""}
          {approval.session_id ? ` - ${approval.session_id}` : ""}
        </span>
      </span>
      <span className="approval-card-time">{formatTime(approval.updated_at)}</span>
    </button>
  );
}
