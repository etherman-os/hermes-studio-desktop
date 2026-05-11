import React from "react";
import type { Approval } from "../../api/studioClient";
import { useApprovalStore } from "../../stores/approvalStore";
import { useContextStore } from "../../stores/contextStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";
import { useSessionStore } from "../../stores/sessionStore";
import { LoadingSkeleton } from "../Skeleton";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "denied", label: "Denied" },
  { id: "high_risk", label: "High risk" },
] as const;

function formatTime(iso: string | null): string {
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

function approvalTitle(approval: Approval): string {
  return approval.tool_name ?? approval.command ?? approval.id;
}

function riskTone(approval: Approval): string {
  if (approval.risk_level === "critical") return "critical";
  if (approval.risk_level === "high") return "high";
  if (approval.risk_level === "medium") return "medium";
  return "low";
}

function payloadPreview(payload: Record<string, unknown> | null): string {
  if (!payload) return "{}";
  return JSON.stringify(payload, null, 2);
}

export function ApprovalsSurface() {
  const approvals = useApprovalStore((s) => s.approvals);
  const pending = useApprovalStore((s) => s.pending);
  const selectedApproval = useApprovalStore((s) => s.selectedApproval);
  const selectedApprovalId = useApprovalStore((s) => s.selectedApprovalId);
  const filter = useApprovalStore((s) => s.filter);
  const loading = useApprovalStore((s) => s.loading);
  const saving = useApprovalStore((s) => s.saving);
  const error = useApprovalStore((s) => s.error);
  const actionMessage = useApprovalStore((s) => s.actionMessage);
  const loadApprovals = useApprovalStore((s) => s.loadApprovals);
  const loadPendingApprovals = useApprovalStore((s) => s.loadPendingApprovals);
  const loadApprovalDetail = useApprovalStore((s) => s.loadApprovalDetail);
  const setFilter = useApprovalStore((s) => s.setFilter);
  const approveApproval = useApprovalStore((s) => s.approveApproval);
  const denyApproval = useApprovalStore((s) => s.denyApproval);
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

  const selected = selectedApproval
    ?? approvals.find((a) => a.id === selectedApprovalId)
    ?? approvals[0]
    ?? null;

  function openRun(runId: string | null | undefined) {
    if (!runId) return;
    selectRun(runId);
    setActiveTab("runs");
  }

  function openSession(sessionId: string | null | undefined) {
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
    <div className="approvals-surface">
      <div className="surface-header">
        <div>
          <div className="workbench-eyebrow">MANAGE mode</div>
          <h2>Approvals</h2>
        </div>
        <div className="surface-actions">
          <button
            className="tool-button"
            onClick={() => {
              void loadPendingApprovals();
              void loadApprovals();
            }}
            disabled={loading}
            aria-label="Refresh approvals"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="approval-readonly-note" role="note">
        Decisions are sent to Hermes when the local runtime exposes approval response support; Studio records the audit trail locally.
      </div>

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

      {error && (
        <div className="run-ledger-notice warning" role="alert">
          Approvals unavailable: {error}
        </div>
      )}
      {actionMessage && (
        <div className="run-ledger-notice" role="status">
          <span>{actionMessage}</span>
          <button className="link-button" onClick={clearActionMessage}>Dismiss</button>
        </div>
      )}

      {pending.length > 0 && (
        <section className="approval-section">
          <div className="context-section-title">
            Pending
            <span className="section-count">{pending.length}</span>
          </div>
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

      <div className="approvals-body">
        <div className="approval-list" role="listbox" aria-label="All approvals">
          {loading && approvals.length === 0 && (
            <div className="approval-list-loading">
              <LoadingSkeleton lines={5} />
            </div>
          )}
          {!loading && approvals.length === 0 && (
            <div className="workbench-empty compact">
              No approvals captured yet. Tool approval requests from run streams will appear here for audit.
            </div>
          )}
          {approvals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              active={selected?.id === approval.id}
              onClick={() => void loadApprovalDetail(approval.id)}
            />
          ))}
        </div>

        <div className="approval-detail-panel">
          {selected ? (
            <>
              <div className="event-detail-header">
                <div>
                  <div className="workbench-eyebrow">Approval Detail</div>
                  <div className="event-detail-title">{approvalTitle(selected)}</div>
                </div>
                <span className={`approval-risk ${riskTone(selected)}`}>
                  {selected.risk_level}
                </span>
              </div>

              <dl className="event-detail-meta">
                <dt>Status</dt>
                <dd>
                  <span className={`status-pill status-${selected.status}`}>
                    {selected.status}
                  </span>
                </dd>
                <dt>Decision</dt>
                <dd>{selected.decision ?? "none"}</dd>
                <dt>Tool</dt>
                <dd>{selected.tool_name ?? "unknown"}</dd>
                <dt>Command/action</dt>
                <dd>{selected.command ?? "unknown"}</dd>
                {selected.run_id && (
                  <>
                    <dt>Run</dt>
                    <dd>
                      <button
                        className="link-button"
                        onClick={() => openRun(selected.run_id)}
                      >
                        {selected.run_id}
                      </button>
                    </dd>
                  </>
                )}
                {selected.session_id && (
                  <>
                    <dt>Session</dt>
                    <dd>
                      <button
                        className="link-button"
                        onClick={() => openSession(selected.session_id)}
                      >
                        {selected.session_id}
                      </button>
                    </dd>
                  </>
                )}
                <dt>Created</dt>
                <dd>{formatTime(selected.created_at)}</dd>
                <dt>Decided</dt>
                <dd>{formatTime(selected.decided_at)}</dd>
                {selected.reason && (
                  <>
                    <dt>Reason</dt>
                    <dd>{selected.reason}</dd>
                  </>
                )}
              </dl>

              <div className="approval-actions">
                {selected.status === "pending" && (
                  <>
                    <button
                      className="primary-button"
                      onClick={() => void approveApproval(selected.id)}
                      disabled={saving}
                    >
                      {saving ? "Sending..." : "Approve"}
                    </button>
                    <button
                      className="tool-button danger"
                      onClick={() => void denyApproval(selected.id)}
                      disabled={saving}
                    >
                      Deny
                    </button>
                  </>
                )}
                <button
                  className="tool-button"
                  onClick={() => openRun(selected.run_id)}
                  disabled={!selected.run_id}
                >
                  Open Run
                </button>
                <button
                  className="tool-button"
                  onClick={() => openSession(selected.session_id)}
                  disabled={!selected.session_id}
                >
                  Open Session
                </button>
                <button
                  className="tool-button"
                  onClick={() => void inspectContext(selected)}
                  disabled={!selected.run_id && !selected.session_id}
                >
                  Inspect Context
                </button>
              </div>

              <details className="approval-payload-details">
                <summary>Request Payload</summary>
                <pre className="event-payload">{payloadPreview(selectedApproval?.request_payload ?? null)}</pre>
              </details>

              {selectedApproval?.events && selectedApproval.events.length > 0 && (
                <div className="approval-events">
                  <div className="session-transcript-header">Event History</div>
                  {selectedApproval.events.map((event, i) => (
                    <div key={i} className="approval-event-item">
                      <span className="approval-event-type">{event.type}</span>
                      <span className="approval-event-time">{formatTime(event.created_at ?? null)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="workbench-empty">
              <div className="workbench-empty-icon" aria-hidden="true">✓</div>
              <div className="workbench-empty-title">Select an approval</div>
              <div className="workbench-empty-copy">
                Choose an approval from the list to inspect request details.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalCard({ approval, active, onClick }: {
  approval: Approval;
  active: boolean;
  onClick: () => void;
}) {
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
          {approval.run_id ? ` · Run ${approval.run_id}` : ""}
          {approval.session_id ? ` · Session ${approval.session_id}` : ""}
        </span>
      </span>
      <span className="approval-card-time">{formatTime(approval.updated_at)}</span>
    </button>
  );
}

// Backward compatibility: re-export the original panel
export { ApprovalCenter } from "./ApprovalCenter";