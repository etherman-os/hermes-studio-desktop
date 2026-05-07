import React from "react";
import { useArtifactStore } from "../../stores/artifactStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { PreviewLauncher } from "../preview/PreviewLauncher";

function isPreviewable(artifact: { type?: string; content_url?: string | null; content_text?: string | null }) {
  if (artifact.content_url) return true;
  if (artifact.type === "report" || artifact.type === "markdown") return false;
  return false;
}

function artifactPreviewUrl(artifact: { content_url?: string | null; content_text?: string | null; type?: string }) {
  if (artifact.content_url) return artifact.content_url;
  return "";
}

export function ArtifactShelf() {
  const artifacts = useArtifactStore((s) => s.artifacts);
  const selectedArtifact = useArtifactStore((s) => s.selectedArtifact);
  const selectedArtifactId = useArtifactStore((s) => s.selectedArtifactId);
  const loading = useArtifactStore((s) => s.loading);
  const error = useArtifactStore((s) => s.error);
  const filterType = useArtifactStore((s) => s.filterType);
  const search = useArtifactStore((s) => s.search);
  const loadArtifacts = useArtifactStore((s) => s.loadArtifacts);
  const selectArtifact = useArtifactStore((s) => s.selectArtifact);
  const setFilterType = useArtifactStore((s) => s.setFilterType);
  const setSearch = useArtifactStore((s) => s.setSearch);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);

  React.useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  return (
    <div className="run-ledger">
      <div className="run-ledger-header">
        <div>
          <div className="workbench-eyebrow">Artifact Shelf</div>
          <div className="run-ledger-title">
            {selectedArtifact ? selectedArtifact.title : "Artifacts"}
          </div>
        </div>
        <div className="run-ledger-actions">
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              void loadArtifacts({ type: e.target.value === "all" ? undefined : e.target.value });
            }}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid var(--app-border, #444)",
              background: "var(--app-bg-elevated, #222)",
              color: "var(--app-text, #e0e0e0)",
              fontSize: 12,
            }}
          >
            <option value="all">All Types</option>
            <option value="markdown">Markdown</option>
            <option value="report">Report</option>
            <option value="log_snapshot">Log Snapshot</option>
            <option value="file">File</option>
            <option value="url">URL</option>
          </select>
          <input
            type="text"
            placeholder="Search artifacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void loadArtifacts();
            }}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid var(--app-border, #444)",
              background: "var(--app-bg-elevated, #222)",
              color: "var(--app-text, #e0e0e0)",
              fontSize: 12,
              width: 160,
            }}
          />
          <button
            className="tool-button"
            onClick={() => void loadArtifacts()}
            disabled={loading}
          >
            {loading ? "Loading" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="run-ledger-notice">{error}</div>}

      <div className="run-ledger-body">
        <div className="recent-runs-list selectable">
          <div className="pane-label">Artifacts ({artifacts.length})</div>
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              className={`recent-run-item ${selectedArtifactId === artifact.id ? "active" : ""}`}
              onClick={() => void selectArtifact(artifact.id)}
            >
              <span className="recent-run-title">{artifact.title}</span>
              <span className="recent-run-meta">
                <span className="status-dot status-completed" />
                {artifact.type}
                {artifact.run_id ? ` · run ${artifact.run_id}` : ""}
              </span>
            </button>
          ))}
          {artifacts.length === 0 && !loading && (
            <div className="workbench-empty compact">
              No artifacts found. Create one from the Run Ledger.
            </div>
          )}
        </div>

        <div className="event-detail selectable">
          {selectedArtifact ? (
            <>
              <div className="event-detail-header">
                <div>
                  <div className="workbench-eyebrow">Artifact</div>
                  <div className="event-detail-title">{selectedArtifact.title}</div>
                </div>
                <span>{selectedArtifact.type}</span>
              </div>
              <dl className="event-detail-meta">
                <dt>ID</dt>
                <dd>{selectedArtifact.id}</dd>
                <dt>Type</dt>
                <dd>{selectedArtifact.type}</dd>
                {selectedArtifact.run_id && (
                  <>
                    <dt>Run</dt>
                    <dd>{selectedArtifact.run_id}</dd>
                  </>
                )}
                {selectedArtifact.session_id && (
                  <>
                    <dt>Session</dt>
                    <dd>{selectedArtifact.session_id}</dd>
                  </>
                )}
                {selectedArtifact.description && (
                  <>
                    <dt>Description</dt>
                    <dd>{selectedArtifact.description}</dd>
                  </>
                )}
              </dl>
              {isPreviewable(selectedArtifact) && (
                <div style={{ padding: "8px 0" }}>
                  <PreviewLauncher
                    url={artifactPreviewUrl(selectedArtifact)}
                    title={selectedArtifact.title}
                    label="Preview in Window"
                  />
                </div>
              )}
              {selectedArtifact.content_text && (
                <pre className="event-payload">{selectedArtifact.content_text.slice(0, 4000)}</pre>
              )}
            </>
          ) : (
            <div className="workbench-empty compact">
              Select an artifact to view its details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
