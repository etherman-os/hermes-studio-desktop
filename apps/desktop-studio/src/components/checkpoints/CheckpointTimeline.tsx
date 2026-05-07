import React from "react";
import { useCheckpointStore } from "../../stores/checkpointStore";
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
  const workspace = useWorkspaceStore((s) => s.selectedWorkspace);

  const selected = checkpoints.find((cp) => cp.hash === selectedHash) ?? null;

  React.useEffect(() => {
    if (workspace && checkpoints.length === 0 && !loading) {
      void loadCheckpoints(workspace);
    }
  }, [workspace, checkpoints.length, loading, loadCheckpoints]);

  function handleSelect(hash: string) {
    if (selectedHash === hash) {
      clearDiff();
      return;
    }
    selectCheckpoint(hash);
    if (workspace) void loadDiff(hash, workspace);
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
          <div className="checkpoint-title">{checkpoints.length} checkpoints</div>
        </div>
        <button className="tool-button" onClick={() => void loadCheckpoints(workspace)}>
          {loading ? "Loading" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="run-ledger-notice warning" role="alert">{error}</div>
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
                <button
                  className="tool-button"
                  disabled
                  title="Restore is not available in v1"
                >
                  Restore (v1: read-only)
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
