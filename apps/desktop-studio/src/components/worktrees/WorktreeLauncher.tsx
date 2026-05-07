import React from "react";
import { useWorktreeStore } from "../../stores/worktreeStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

function formatTime(iso: string | null) {
  if (!iso) return "never";
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

function shortPath(path: string) {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return ".../" + parts.slice(-2).join("/");
}

export function WorktreeLauncher() {
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const loading = useWorktreeStore((s) => s.loading);
  const creating = useWorktreeStore((s) => s.creating);
  const error = useWorktreeStore((s) => s.error);
  const actionMessage = useWorktreeStore((s) => s.actionMessage);
  const isGitRepo = useWorktreeStore((s) => s.isGitRepo);
  const loadWorktrees = useWorktreeStore((s) => s.loadWorktrees);
  const createWorktree = useWorktreeStore((s) => s.createWorktree);
  const removeWorktree = useWorktreeStore((s) => s.removeWorktree);
  const startRun = useWorktreeStore((s) => s.startRun);
  const clearActionMessage = useWorktreeStore((s) => s.clearActionMessage);
  const workspace = useWorkspaceStore((s) => s.selectedWorkspace);

  const [branchInput, setBranchInput] = React.useState("");
  const [promptInput, setPromptInput] = React.useState("");
  const [activeWorktreeId, setActiveWorktreeId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (workspace && worktrees.length === 0 && !loading) {
      void loadWorktrees(workspace);
    }
  }, [workspace, worktrees.length, loading, loadWorktrees]);

  async function handleCreate() {
    if (!workspace || !branchInput.trim()) return;
    const ok = await createWorktree(workspace, branchInput.trim());
    if (ok) setBranchInput("");
  }

  async function handleRemove(id: string, status: string) {
    if (status === "main") return;
    const confirmed = window.confirm("Remove this worktree? This will delete the directory.");
    if (!confirmed) return;
    await removeWorktree(id);
  }

  async function handleStartRun(id: string) {
    if (!promptInput.trim()) return;
    await startRun(id, promptInput.trim());
    setPromptInput("");
    setActiveWorktreeId(null);
  }

  if (!workspace) {
    return (
      <div className="workbench-empty" role="status">
        <div className="workbench-empty-icon" aria-hidden="true">W</div>
        <div className="workbench-empty-title">No workspace selected</div>
        <div className="workbench-empty-copy">
          Select a workspace to manage git worktrees.
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
          Worktrees require a git repository. Initialize one with <code>git init</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="worktree-launcher">
      <div className="worktree-header">
        <div>
          <div className="workbench-eyebrow">Worktree Launcher</div>
          <div className="worktree-title">{worktrees.length} worktrees</div>
        </div>
        <button className="tool-button" onClick={() => workspace && void loadWorktrees(workspace)}>
          {loading ? "Loading" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="run-ledger-notice warning" role="alert">{error}</div>
      )}
      {actionMessage && (
        <div className="run-ledger-notice" role="status">
          {actionMessage}
          <button className="inline-dismiss" onClick={clearActionMessage} aria-label="Dismiss">x</button>
        </div>
      )}

      <div className="worktree-create-form">
        <input
          className="worktree-input"
          type="text"
          placeholder="Branch name (e.g. feature/my-feature)"
          value={branchInput}
          onChange={(e) => setBranchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
          disabled={creating}
          aria-label="New branch name"
        />
        <button
          className="tool-button"
          onClick={() => void handleCreate()}
          disabled={creating || !branchInput.trim()}
        >
          {creating ? "Creating" : "New Worktree"}
        </button>
      </div>

      <div className="worktree-list">
        {worktrees.length === 0 && !loading && (
          <div className="workbench-empty compact">
            No worktrees yet. Create one above to work on multiple branches simultaneously.
          </div>
        )}
        {worktrees.map((wt) => (
          <div
            key={wt.id}
            className={`worktree-card status-${wt.status}`}
          >
            <div className="worktree-card-header">
              <span className="worktree-branch">{wt.branch ?? "detached"}</span>
              <span className={`worktree-status-pill status-${wt.status}`}>{wt.status}</span>
            </div>
            <div className="worktree-card-meta">
              <span title={wt.worktree_path}>{shortPath(wt.worktree_path)}</span>
              <span>Runs: {wt.run_count}</span>
              <span>Last used: {formatTime(wt.last_used_at)}</span>
            </div>
            <div className="worktree-card-actions">
              {activeWorktreeId === wt.id ? (
                <div className="worktree-run-form">
                  <input
                    className="worktree-input"
                    type="text"
                    placeholder="Prompt for this worktree..."
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleStartRun(wt.id)}
                    aria-label="Run prompt"
                    autoFocus
                  />
                  <button
                    className="tool-button"
                    onClick={() => void handleStartRun(wt.id)}
                    disabled={!promptInput.trim()}
                  >
                    Run
                  </button>
                  <button
                    className="tool-button secondary"
                    onClick={() => { setActiveWorktreeId(null); setPromptInput(""); }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="tool-button"
                    onClick={() => setActiveWorktreeId(wt.id)}
                  >
                    Start Run Here
                  </button>
                  {wt.status !== "main" && (
                    <button
                      className="tool-button danger"
                      onClick={() => void handleRemove(wt.id, wt.status)}
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
