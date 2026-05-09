import React from "react";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useRunStore } from "../../stores/runStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

function formatTime(iso: string) {
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

function truncate(str: string, max: number) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

export function CheckpointTimeline() {
  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const selectedHash = useCheckpointStore((s) => s.selectedHash);
  const diff = useCheckpointStore((s) => s.diff);
  const loading = useCheckpointStore((s) => s.loading);
  const diffLoading = useCheckpointStore((s) => s.diffLoading);
  const error = useCheckpointStore((s) => s.error);
  const isGitRepo = useCheckpointStore((s) => s.isGitRepo);
  const loadCheckpoints = useCheckpointStore((s) => s.loadCheckpoints);
  const selectCheckpoint = useCheckpointStore((s) => s.selectCheckpoint);
  const loadDiff = useCheckpointStore((s) => s.loadDiff);
  const clearDiff = useCheckpointStore((s) => s.clearDiff);
  const checkpointStore = useHermesInventoryStore((s) => s.checkpointStore);
  const checkpointPruneResult = useHermesInventoryStore((s) => s.checkpointPruneResult);
  const checkpointPruning = useHermesInventoryStore((s) => s.checkpointPruning);
  const pruneCheckpointStore = useHermesInventoryStore((s) => s.pruneCheckpointStore);
  const loadLocalHermesStatus = useHermesInventoryStore((s) => s.loadLocalHermesStatus);
  const workspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const sendPrompt = useRunStore((s) => s.sendPrompt);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);

  const selected = checkpoints.find((cp) => cp.hash === selectedHash) ?? null;

  React.useEffect(() => {
    if (workspace && checkpoints.length === 0 && !loading) {
      void loadCheckpoints(workspace);
    }
  }, [workspace, checkpoints.length, loading, loadCheckpoints]);

  React.useEffect(() => {
    void loadLocalHermesStatus();
  }, [loadLocalHermesStatus]);

  function handleSelect(hash: string) {
    if (selectedHash === hash) {
      clearDiff();
      return;
    }
    selectCheckpoint(hash);
    if (workspace) void loadDiff(hash, workspace);
  }

  async function createRollbackPlan() {
    if (!workspace || !selected) return;
    setActiveTab("chat");
    await sendPrompt(
      [
        "Hermes Checkpoint Rollback Studio request",
        `Workspace: ${workspace}`,
        `Checkpoint: ${selected.hash}`,
        `Message: ${selected.message}`,
        `Author: ${selected.author}`,
        `Timestamp: ${selected.timestamp}`,
        diff?.stat ? `Diff stat:\n${diff.stat}` : "",
        diff?.diff ? `Diff preview:\n${diff.diff.slice(0, 6000)}` : "",
        "Create a safe rollback or repair plan for this checkpoint. Prefer reversible changes, explain exact files affected, use checkpoints/worktree isolation when available, and do not run destructive git reset/checkout commands without explicit user approval.",
      ].filter(Boolean).join("\n\n"),
      activeSessionId ?? "default",
      {
        workspacePath: workspace,
        mode: "review",
        checkpoints: true,
        worktree: true,
        maxTurns: 4,
      },
    );
  }

  if (!workspace) {
    return (
      <div className="workbench-empty" role="status">
        <div className="workbench-empty-icon" aria-hidden="true">C</div>
        <div className="workbench-empty-title">No workspace selected</div>
        <div className="workbench-empty-copy">
          Select a workspace to view checkpoint timeline.
        </div>
      </div>
    );
  }

  if (!isGitRepo && !loading) {
    return (
      <div className="workbench-empty" role="status">
        <div className="workbench-empty-icon" aria-hidden="true">G</div>
        <div className="workbench-empty-title">Not a git repository</div>
        <div className="workbench-empty-copy">
          Checkpoints require a git repository. Initialize one with <code>git init</code>.
        </div>
      </div>
    );
  }

  if (!loading && checkpoints.length === 0) {
    return (
      <div className="workbench-empty" role="status">
        <div className="workbench-empty-icon" aria-hidden="true">T</div>
        <div className="workbench-empty-title">No checkpoints found</div>
        <div className="workbench-empty-copy">
          Create checkpoints by tagging commits with <code>[checkpoint]</code> in the message or using a <code>cp/</code> prefix.
        </div>
        <button className="tool-button" onClick={() => void loadCheckpoints(workspace)}>Refresh</button>
      </div>
    );
  }

  return (
    <div className="checkpoint-timeline">
      <div className="checkpoint-header">
        <div>
          <div className="workbench-eyebrow">Checkpoint Timeline</div>
          <div className="checkpoint-title">
            {checkpoints.length} checkpoints
            {checkpointStore?.status?.total_size ? ` · store ${checkpointStore.status.total_size}` : ""}
          </div>
        </div>
        <div className="checkpoint-header-actions">
          <button className="tool-button" onClick={() => void pruneCheckpointStore({ retention_days: 7, max_size_mb: 500 })} disabled={checkpointPruning}>
            {checkpointPruning ? "Pruning" : "Prune Store"}
          </button>
          <button className="tool-button" onClick={() => void loadCheckpoints(workspace)}>
            {loading ? "Loading" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="run-ledger-notice warning" role="alert">{error}</div>
      )}
      {checkpointPruneResult && (
        <div className={`run-ledger-notice ${checkpointPruneResult.ok ? "" : "warning"}`}>
          {checkpointPruneResult.message || (checkpointPruneResult.ok ? "Checkpoint store pruned" : checkpointPruneResult.error ?? "Checkpoint prune failed")}
        </div>
      )}

      <div className="checkpoint-body">
        <div className="checkpoint-list selectable" role="listbox" aria-label="Checkpoints">
          {checkpoints.map((cp) => (
            <button
              key={cp.hash}
              role="option"
              aria-selected={selectedHash === cp.hash}
              className={`checkpoint-item ${cp.is_head ? "is-head" : ""} ${selectedHash === cp.hash ? "active" : ""}`}
              onClick={() => handleSelect(cp.hash)}
            >
              <span className="checkpoint-dot" aria-hidden="true" />
              <span className="checkpoint-main">
                <span className="checkpoint-message">{truncate(cp.message, 80)}</span>
                <span className="checkpoint-meta">
                  <span className="checkpoint-hash">{cp.short_hash}</span>
                  <span>{cp.author}</span>
                  <span>{formatTime(cp.timestamp)}</span>
                  <span>{cp.files_changed} files</span>
                  {cp.is_head && <span className="checkpoint-head-badge">HEAD</span>}
                </span>
              </span>
              <span className="checkpoint-stats">
                <span className="stat-insertions">+{cp.insertions}</span>
                <span className="stat-deletions">-{cp.deletions}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="checkpoint-detail selectable">
          {selected ? (
            <>
              <div className="event-detail-header">
                <div>
                  <div className="workbench-eyebrow">Checkpoint</div>
                  <div className="event-detail-title">{selected.message}</div>
                </div>
                <span>{formatTime(selected.timestamp)}</span>
              </div>
              <dl className="event-detail-meta">
                <dt>Hash</dt>
                <dd>{selected.hash}</dd>
                <dt>Author</dt>
                <dd>{selected.author}</dd>
                <dt>Files</dt>
                <dd>{selected.files_changed}</dd>
                <dt>Changes</dt>
                <dd>+{selected.insertions} / -{selected.deletions}</dd>
                <dt>HEAD</dt>
                <dd>{selected.is_head ? "Yes" : "No"}</dd>
              </dl>
              <div className="checkpoint-actions">
                <button className="tool-button" onClick={() => void loadDiff(selected.hash, workspace)}>
                  {diffLoading ? "Loading Diff" : "Load Diff"}
                </button>
                <button className="primary-button" onClick={() => void createRollbackPlan()}>
                  Rollback Plan
                </button>
              </div>
              {diffLoading && <div className="workbench-empty compact">Loading diff...</div>}
              {diff && !diffLoading && (
                <>
                  <div className="workbench-eyebrow" style={{ marginTop: 12 }}>Affected Files</div>
                  <ul className="checkpoint-files">
                    {diff.files.map((f) => (
                      <li key={f} className="checkpoint-file-item">{f}</li>
                    ))}
                  </ul>
                  {diff.stat && (
                    <>
                      <div className="workbench-eyebrow" style={{ marginTop: 12 }}>Diff Summary</div>
                      <pre className="event-payload">{diff.stat}</pre>
                    </>
                  )}
                  {diff.diff && (
                    <>
                      <div className="workbench-eyebrow" style={{ marginTop: 12 }}>Diff Preview</div>
                      <pre className="event-payload checkpoint-diff">{diff.diff}</pre>
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="workbench-empty compact">Select a checkpoint to view details and diff.</div>
          )}
        </div>
      </div>
    </div>
  );
}
