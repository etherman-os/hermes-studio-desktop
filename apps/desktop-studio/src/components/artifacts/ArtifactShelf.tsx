import React from "react";
import { useArtifactStore } from "../../stores/artifactStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useRunStore } from "../../stores/runStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
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

function artifactTarget(artifact: { id: string; file_path?: string | null; content_url?: string | null }) {
  return artifact.content_url || artifact.file_path || artifact.id;
}

function clickablePreviewDoc(content: string) {
  const bridge = `
<script>
(() => {
  function selectorFor(el) {
    if (!el || !el.tagName) return "unknown";
    const tag = el.tagName.toLowerCase();
    if (el.id) return tag + "#" + el.id;
    const cls = String(el.className || "").trim().split(/\\s+/).filter(Boolean).slice(0, 2).join(".");
    return cls ? tag + "." + cls : tag;
  }
  document.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target;
    window.parent.postMessage({
      type: "hermes:artifact-element-selected",
      selector: selectorFor(target),
      text: String(target && target.textContent || "").trim().slice(0, 160)
    }, "*");
  }, true);
})();
</script>`;
  if (content.includes("</body>")) {
    return content.replace("</body>", `${bridge}</body>`);
  }
  return `${content}${bridge}`;
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
  const sendPrompt = useRunStore((s) => s.sendPrompt);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const skills = useHermesInventoryStore((s) => s.skills);
  const toolsets = useHermesInventoryStore((s) => s.toolsets);
  const [visualPrompt, setVisualPrompt] = React.useState("");

  React.useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  React.useEffect(() => {
    function handlePreviewMessage(event: MessageEvent) {
      const data = event.data as { type?: string; selector?: string; text?: string };
      if (data?.type !== "hermes:artifact-element-selected") return;
      const text = data.text ? ` Text: "${data.text}"` : "";
      setVisualPrompt(`Update ${data.selector ?? "the selected element"}.${text}`);
    }
    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, []);

  const designSkillIds = skills
    .filter((skill) => skill.installed && (
      skill.id.includes("creative/claude-design")
      || skill.id.includes("creative/popular-web-designs")
      || skill.id.includes("web-development")
    ))
    .slice(0, 3)
    .map((skill) => skill.id);
  const designToolsets = toolsets
    .filter((toolset) => ["browser", "web", "file", "vision"].includes(toolset.id) || toolset.kind === "mcp")
    .slice(0, 6)
    .map((toolset) => toolset.id);

  function sendArtifactPrompt(kind: "visual-edit" | "variants" | "browser-check") {
    if (!selectedArtifact) return;
    const target = artifactTarget(selectedArtifact);
    const excerpt = selectedArtifact.content_text?.slice(0, 1600) ?? "";
    const instruction = kind === "visual-edit"
      ? visualPrompt.trim()
      : kind === "variants"
        ? "Create three production-quality visual variants, compare them, and preserve a reversible artifact history."
        : "Run a browser-in-the-loop inspection, capture visual issues, and propose concrete fixes.";
    if (!instruction) return;
    setActiveTab("chat");
    void sendPrompt(
      [
        `Hermes Artifact Studio request: ${kind}`,
        `Artifact: ${selectedArtifact.title} (${selectedArtifact.id})`,
        `Target: ${target}`,
        selectedArtifact.description ? `Description: ${selectedArtifact.description}` : "",
        excerpt ? `Current artifact excerpt:\n${excerpt}` : "",
        `Instruction:\n${instruction}`,
      ].filter(Boolean).join("\n\n"),
      activeSessionId ?? "default",
      {
        workspacePath: selectedWorkspace,
        mode: "design",
        skills: designSkillIds,
        toolsets: designToolsets,
      },
    );
    if (kind === "visual-edit") setVisualPrompt("");
  }

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
              {selectedArtifact.type === "html" && selectedArtifact.content_text && (
                <div className="artifact-inline-preview">
                  <iframe
                    title={`${selectedArtifact.title} preview`}
                    srcDoc={clickablePreviewDoc(selectedArtifact.content_text)}
                    sandbox="allow-scripts allow-forms"
                  />
                </div>
              )}
              <div className="artifact-design-panel">
                <div className="inventory-section-title">Design actions</div>
                <textarea
                  className="studio-textarea artifact-design-textarea"
                  value={visualPrompt}
                  onChange={(event) => setVisualPrompt(event.target.value)}
                  placeholder="Targeted visual edit..."
                  aria-label="Targeted visual edit prompt"
                />
                <div className="artifact-design-actions">
                  <button
                    className="primary-button"
                    disabled={!visualPrompt.trim()}
                    onClick={() => sendArtifactPrompt("visual-edit")}
                  >
                    Visual Edit
                  </button>
                  <button className="tool-button" onClick={() => sendArtifactPrompt("variants")}>
                    A/B Variants
                  </button>
                  <button className="tool-button" onClick={() => sendArtifactPrompt("browser-check")}>
                    Browser Check
                  </button>
                </div>
              </div>
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
