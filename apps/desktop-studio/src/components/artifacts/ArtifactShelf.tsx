import React from "react";
import { useArtifactStore } from "../../stores/artifactStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useRunStore } from "../../stores/runStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
import { PreviewLauncher } from "../preview/PreviewLauncher";
import type { ArtifactRevision } from "../../api/studioClient";

type DiffRow = {
  type: "same" | "added" | "removed";
  text: string;
  oldLine?: number;
  newLine?: number;
};

const MAX_DIFF_LINES = 420;

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

function canRunBrowserEvidence(artifact: { type?: string; file_path?: string | null; content_url?: string | null; content_text?: string | null }) {
  return (artifact.type === "html" && Boolean(artifact.content_text?.trim())) || Boolean(artifact.content_url || artifact.file_path);
}

function sanitizedPreviewDoc(content: string) {
  if (typeof window === "undefined") return content;
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/html");
  doc.querySelectorAll("script, form, iframe, object, embed").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        node.removeAttribute(attr.name);
      }
    }
  });
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}

function cssSelectorForElement(element: Element) {
  if (element.id) return `${element.tagName.toLowerCase()}#${CSS.escape(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.tagName.toLowerCase() !== "html") {
    const tag = current.tagName.toLowerCase();
    const classNames = [...current.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(`${tag}${classNames}`);
      break;
    }
    const currentTag = current.tagName;
    const siblings = [...parent.children].filter((child) => child.tagName === currentTag);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${tag}${classNames}${siblings.length > 1 ? `:nth-of-type(${index})` : ""}`);
    if (tag === "body") break;
    current = parent;
  }
  return parts.join(" > ");
}

function selectedElementLabel(element: Element) {
  const text = element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80);
  const id = element.id ? `#${element.id}` : "";
  const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join("");
  return [element.tagName.toLowerCase() + id + classes, text ? `"${text}"` : ""].filter(Boolean).join(" ");
}

function splitDiffLines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function buildLineDiff(previous: string, current: string): DiffRow[] {
  const previousAll = splitDiffLines(previous);
  const currentAll = splitDiffLines(current);
  const previousLines = previousAll.slice(0, MAX_DIFF_LINES);
  const currentLines = currentAll.slice(0, MAX_DIFF_LINES);
  const dp = Array.from({ length: previousLines.length + 1 }, () => new Uint16Array(currentLines.length + 1));

  for (let i = previousLines.length - 1; i >= 0; i -= 1) {
    for (let j = currentLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] = previousLines[i] === currentLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < previousLines.length && newIndex < currentLines.length) {
    if (previousLines[oldIndex] === currentLines[newIndex]) {
      rows.push({
        type: "same",
        text: previousLines[oldIndex],
        oldLine: oldIndex + 1,
        newLine: newIndex + 1,
      });
      oldIndex += 1;
      newIndex += 1;
    } else if (dp[oldIndex + 1][newIndex] >= dp[oldIndex][newIndex + 1]) {
      rows.push({ type: "removed", text: previousLines[oldIndex], oldLine: oldIndex + 1 });
      oldIndex += 1;
    } else {
      rows.push({ type: "added", text: currentLines[newIndex], newLine: newIndex + 1 });
      newIndex += 1;
    }
  }

  while (oldIndex < previousLines.length) {
    rows.push({ type: "removed", text: previousLines[oldIndex], oldLine: oldIndex + 1 });
    oldIndex += 1;
  }
  while (newIndex < currentLines.length) {
    rows.push({ type: "added", text: currentLines[newIndex], newLine: newIndex + 1 });
    newIndex += 1;
  }
  if (previousAll.length > MAX_DIFF_LINES || currentAll.length > MAX_DIFF_LINES) {
    rows.push({
      type: "same",
      text: `Diff truncated to first ${MAX_DIFF_LINES} lines for UI responsiveness.`,
    });
  }
  return rows;
}

function diffSummary(rows: DiffRow[]) {
  return rows.reduce(
    (summary, row) => ({
      added: summary.added + (row.type === "added" ? 1 : 0),
      removed: summary.removed + (row.type === "removed" ? 1 : 0),
    }),
    { added: 0, removed: 0 },
  );
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
  const createArtifact = useArtifactStore((s) => s.createArtifact);
  const updateArtifact = useArtifactStore((s) => s.updateArtifact);
  const loadRevisions = useArtifactStore((s) => s.loadRevisions);
  const revertArtifact = useArtifactStore((s) => s.revertArtifact);
  const createVariantGroup = useArtifactStore((s) => s.createVariantGroup);
  const addVariant = useArtifactStore((s) => s.addVariant);
  const applyVariant = useArtifactStore((s) => s.applyVariant);
  const runBrowserEvidence = useArtifactStore((s) => s.runBrowserEvidence);
  const saving = useArtifactStore((s) => s.saving);
  const setFilterType = useArtifactStore((s) => s.setFilterType);
  const setSearch = useArtifactStore((s) => s.setSearch);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const sendPrompt = useRunStore((s) => s.sendPrompt);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const skills = useHermesInventoryStore((s) => s.skills);
  const toolsets = useHermesInventoryStore((s) => s.toolsets);
  const [visualPrompt, setVisualPrompt] = React.useState("");
  const [targetSelector, setTargetSelector] = React.useState("");
  const [visualSelectEnabled, setVisualSelectEnabled] = React.useState(false);
  const [selectedPreviewLabel, setSelectedPreviewLabel] = React.useState("");
  const [htmlDraft, setHtmlDraft] = React.useState("");
  const [selectedRevisionVersion, setSelectedRevisionVersion] = React.useState<number | null>(null);
  const visualSelectEnabledRef = React.useRef(false);

  React.useEffect(() => {
    visualSelectEnabledRef.current = visualSelectEnabled;
  }, [visualSelectEnabled]);

  React.useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  React.useEffect(() => {
    setHtmlDraft(selectedArtifact?.type === "html" ? selectedArtifact.content_text ?? "" : "");
    setTargetSelector("");
    setSelectedPreviewLabel("");
    setSelectedRevisionVersion(null);
  }, [selectedArtifact?.id, selectedArtifact?.type, selectedArtifact?.content_text]);

  React.useEffect(() => {
    if (!selectedArtifact?.id || !selectedArtifact.content_text) return;
    const needsRevisionContent = (selectedArtifact.revisions ?? []).some(
      (revision) => revision.has_content && revision.content_text === undefined,
    );
    if (needsRevisionContent) {
      void loadRevisions(selectedArtifact.id, true);
    }
  }, [loadRevisions, selectedArtifact?.id, selectedArtifact?.content_text, selectedArtifact?.revisions]);

  const safeHtmlPreview = React.useMemo(() => {
    if (selectedArtifact?.type !== "html" || !htmlDraft) return "";
    return sanitizedPreviewDoc(htmlDraft);
  }, [selectedArtifact?.type, htmlDraft]);

  const revisionOptions = React.useMemo<ArtifactRevision[]>(() => (
    (selectedArtifact?.revisions ?? []).filter(
      (revision) => revision.has_content && typeof revision.content_text === "string",
    )
  ), [selectedArtifact?.revisions]);
  const selectedRevision = React.useMemo(() => {
    if (revisionOptions.length === 0) return null;
    if (selectedRevisionVersion !== null) {
      return revisionOptions.find((revision) => revision.version === selectedRevisionVersion) ?? revisionOptions[0];
    }
    const newestVersion = selectedArtifact?.revisions?.[0]?.version;
    return revisionOptions.find((revision) => revision.version !== newestVersion) ?? revisionOptions[0];
  }, [revisionOptions, selectedArtifact?.revisions, selectedRevisionVersion]);
  const currentComparableContent = selectedArtifact?.type === "html"
    ? htmlDraft
    : selectedArtifact?.content_text ?? "";
  const revisionDiffRows = React.useMemo(() => (
    selectedRevision ? buildLineDiff(selectedRevision.content_text ?? "", currentComparableContent) : []
  ), [currentComparableContent, selectedRevision]);
  const revisionDiffSummary = React.useMemo(() => diffSummary(revisionDiffRows), [revisionDiffRows]);
  const revisionContentPending = Boolean((selectedArtifact?.revisions ?? []).some(
    (revision) => revision.has_content && revision.content_text === undefined,
  ));

  const designSkillIds = skills
    .filter((skill) => skill.installed && (
      skill.id.includes("creative/claude-design")
      || skill.id.includes("creative/popular-web-designs")
      || skill.id.includes("web-development")
    ))
    .slice(0, 3)
    .map((skill) => skill.cli_name || skill.name || skill.id);
  const designToolsets = toolsets
    .filter((toolset) => ["browser", "web", "file", "vision"].includes(toolset.id) || toolset.kind === "mcp")
    .slice(0, 6)
    .map((toolset) => toolset.id);

  async function sendArtifactPrompt(kind: "visual-edit" | "variants" | "browser-check" | "design-memory" | "video-brief") {
    if (!selectedArtifact) return;
    const target = artifactTarget(selectedArtifact);
    const excerpt = selectedArtifact.content_text?.slice(0, 1600) ?? "";
    let variantGroupId = "";
    const instruction = kind === "visual-edit"
      ? visualPrompt.trim()
      : kind === "variants"
        ? "Create three production-quality visual variants, compare them, and preserve a reversible artifact history."
        : kind === "browser-check"
          ? "Run a browser-in-the-loop inspection, capture visual issues, and propose concrete fixes."
          : kind === "video-brief"
            ? "Turn this artifact into a video production plan: storyboard, shot list, motion prompts, image/video generation prompts, timing, and verification notes."
            : "Extract a reusable Design DNA profile from this artifact: palette, typography, spacing, motion, component rules, accessibility constraints, and prompts Hermes should reuse on future visual edits.";
    if (!instruction) return;
    if (kind === "browser-check") {
      await createArtifact({
        title: `Browser evidence request · ${selectedArtifact.title}`,
        type: "report",
        description: `Browser-in-the-loop evidence plan for ${selectedArtifact.id}`,
        source: "browser_check",
        session_id: activeSessionId,
        content_text: [
          `Source artifact: ${selectedArtifact.title} (${selectedArtifact.id})`,
          `Target: ${target}`,
          "Evidence to collect: screenshot, console issues, accessibility/visual findings, reproduction steps, and concrete fixes.",
          excerpt ? `Source excerpt:\n${excerpt}` : "",
        ].filter(Boolean).join("\n\n"),
      });
    }
    if (kind === "design-memory") {
      await createArtifact({
        title: `Design DNA request · ${selectedArtifact.title}`,
        type: "markdown",
        description: `Reusable visual preference extraction for ${selectedArtifact.id}`,
        source: "design_memory",
        session_id: activeSessionId,
        content_text: [
          `Source artifact: ${selectedArtifact.title} (${selectedArtifact.id})`,
          `Target: ${target}`,
          "Extract reusable visual rules, not one-off edits. Do not store secrets or private content.",
          excerpt ? `Source excerpt:\n${excerpt}` : "",
        ].filter(Boolean).join("\n\n"),
      });
    }
    if (kind === "variants") {
      const draftChanged = Boolean(selectedArtifact.type === "html"
        && htmlDraft.trim()
        && htmlDraft !== (selectedArtifact.content_text ?? ""));
      const group = await createVariantGroup(selectedArtifact.id, {
        title: `A/B Variant Studio · ${selectedArtifact.title}`,
        brief: visualPrompt.trim() || "Hermes-generated production alternatives for visual comparison and reversible apply.",
        variants: draftChanged
          ? [{
              label: "Draft",
              title: "Current Studio draft",
              content_text: htmlDraft,
              mime_type: "text/html",
              rationale: "Unsaved live-source draft captured before Hermes variant generation.",
            }]
          : [],
      });
      variantGroupId = group?.id ?? "";
    }
    setActiveTab("chat");
    await sendPrompt(
      [
        `Hermes Artifact Studio request: ${kind}`,
        `Artifact: ${selectedArtifact.title} (${selectedArtifact.id})`,
        variantGroupId ? `Studio variant group: ${variantGroupId}` : "",
        `Target: ${target}`,
        targetSelector.trim() ? `Selected selector: ${targetSelector.trim()}` : "",
        selectedArtifact.description ? `Description: ${selectedArtifact.description}` : "",
        excerpt ? `Current artifact excerpt:\n${excerpt}` : "",
        kind === "variants"
          ? "Return candidates as complete replacement content with label, title, rationale, and score so Studio can save each one into this variant group."
          : "",
        `Instruction:\n${instruction}`,
      ].filter(Boolean).join("\n\n"),
      activeSessionId ?? "default",
      {
        workspacePath: selectedWorkspace,
        mode: kind === "design-memory" ? "memory" : kind === "video-brief" ? "video" : "design",
        skills: designSkillIds,
        toolsets: kind === "video-brief"
          ? [...new Set([...designToolsets, "video", "image_gen"])]
          : kind === "design-memory"
            ? [...new Set([...designToolsets, "memory", "session_search"])]
            : designToolsets,
        checkpoints: kind !== "design-memory",
      },
    );
    if (kind === "visual-edit") setVisualPrompt("");
  }

  async function saveHtmlDraft() {
    if (!selectedArtifact || selectedArtifact.type !== "html") return;
    await updateArtifact(selectedArtifact.id, {
      content_text: htmlDraft,
      description: selectedArtifact.description ?? undefined,
    });
  }

  async function saveDraftVariant(groupId: string) {
    if (!selectedArtifact || selectedArtifact.type !== "html" || !htmlDraft.trim()) return;
    await addVariant(groupId, {
      label: "Draft",
      title: "Live source draft",
      content_text: htmlDraft,
      mime_type: "text/html",
      rationale: "Manual Studio draft captured from the live source editor.",
    });
  }

  function attachVisualSelector(event: React.SyntheticEvent<HTMLIFrameElement>) {
    const iframe = event.currentTarget;
    try {
      const doc = iframe.contentDocument;
      if (!doc || doc.getElementById("hermes-studio-selector-style")) return;
      const style = doc.createElement("style");
      style.id = "hermes-studio-selector-style";
      style.textContent = `
        [data-hermes-studio-selected="true"] {
          outline: 2px solid #58a6ff !important;
          outline-offset: 3px !important;
          box-shadow: 0 0 0 6px rgba(88, 166, 255, 0.18) !important;
        }
        [data-hermes-studio-hover="true"] {
          outline: 1px dashed #f2cc60 !important;
          outline-offset: 2px !important;
        }
      `;
      doc.head.appendChild(style);

      doc.addEventListener("mouseover", (mouseEvent) => {
        if (!visualSelectEnabledRef.current) return;
        const target = mouseEvent.target;
        if (!(target instanceof Element)) return;
        doc.querySelectorAll("[data-hermes-studio-hover]").forEach((node) => node.removeAttribute("data-hermes-studio-hover"));
        target.setAttribute("data-hermes-studio-hover", "true");
      }, true);
      doc.addEventListener("click", (mouseEvent) => {
        if (!visualSelectEnabledRef.current) return;
        const target = mouseEvent.target;
        if (!(target instanceof Element)) return;
        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
        doc.querySelectorAll("[data-hermes-studio-selected]").forEach((node) => node.removeAttribute("data-hermes-studio-selected"));
        target.setAttribute("data-hermes-studio-selected", "true");
        const selector = cssSelectorForElement(target);
        setTargetSelector(selector);
        setSelectedPreviewLabel(selectedElementLabel(target));
      }, true);
    } catch {
      setSelectedPreviewLabel("Preview selector unavailable for this artifact sandbox.");
    }
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
                <div className="artifact-live-studio">
                  <div className={`artifact-inline-preview ${visualSelectEnabled ? "selecting" : ""}`}>
                    <iframe
                      title={`${selectedArtifact.title} preview`}
                      srcDoc={safeHtmlPreview}
                      sandbox="allow-same-origin"
                      onLoad={attachVisualSelector}
                    />
                  </div>
                  <div className="artifact-source-editor">
                    <div className="source-editor-toolbar">
                      <span>Live source</span>
                      <div>
                        <PreviewLauncher
                          html={htmlDraft || (selectedArtifact.content_text ?? "")}
                          title={selectedArtifact.title}
                          label="Open Preview Window"
                        />
                        <button className="tool-button" type="button" onClick={() => setHtmlDraft(selectedArtifact.content_text ?? "")}>
                          Reset
                        </button>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={saving || htmlDraft === (selectedArtifact.content_text ?? "")}
                          onClick={() => void saveHtmlDraft()}
                        >
                          {saving ? "Saving" : "Save"}
                        </button>
                      </div>
                    </div>
                    <textarea
                      className="studio-textarea artifact-source-textarea"
                      value={htmlDraft}
                      onChange={(event) => setHtmlDraft(event.target.value)}
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}
              <div className="artifact-design-panel">
                <div className="inventory-section-title">Design actions</div>
                {selectedArtifact.type === "html" && selectedArtifact.content_text && (
                  <div className="visual-selector-toolbar">
                    <button
                      className={`tool-button ${visualSelectEnabled ? "active" : ""}`}
                      type="button"
                      onClick={() => setVisualSelectEnabled((current) => !current)}
                    >
                      {visualSelectEnabled ? "Selecting Element" : "Click-to-Edit"}
                    </button>
                    <span>{selectedPreviewLabel || "Click an element in the preview to target Hermes precisely."}</span>
                  </div>
                )}
                <input
                  className="studio-input"
                  value={targetSelector}
                  onChange={(event) => setTargetSelector(event.target.value)}
                  placeholder="Optional CSS selector or component path"
                  aria-label="Selected visual target"
                />
                <textarea
                  className="studio-textarea artifact-design-textarea"
                  value={visualPrompt}
                  onChange={(event) => setVisualPrompt(event.target.value)}
                  placeholder="Targeted visual edit..."
                  aria-label="Targeted visual edit prompt"
                />
                <div className="quick-visual-grid">
                  {[
                    ["Text", "Rewrite the selected element text to be clearer, shorter, and more production-ready."],
                    ["Color", "Improve the selected element color, contrast, hover/focus state, and visual relationship to the surrounding design."],
                    ["Spacing", "Refine spacing, padding, alignment, and responsive fit around the selected element."],
                    ["Motion", "Add tasteful motion or interaction feedback to the selected element without hurting accessibility."],
                  ].map(([label, instruction]) => (
                    <button
                      key={label}
                      type="button"
                      className="tool-button"
                      onClick={() => setVisualPrompt(`${targetSelector ? `For ${targetSelector}: ` : ""}${instruction}`)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="artifact-design-actions">
                  <button
                    className="primary-button"
                    disabled={!visualPrompt.trim()}
                    onClick={() => void sendArtifactPrompt("visual-edit")}
                  >
                    Visual Edit
                  </button>
                  <button className="tool-button" onClick={() => void sendArtifactPrompt("variants")}>
                    A/B Variants
                  </button>
                  <button className="tool-button" onClick={() => void sendArtifactPrompt("browser-check")}>
                    Browser Check
                  </button>
                  <button
                    className="tool-button"
                    disabled={saving || !canRunBrowserEvidence(selectedArtifact)}
                    title={canRunBrowserEvidence(selectedArtifact) ? "Capture a local Playwright screenshot and report" : "Requires HTML content, URL, or file path"}
                    onClick={() => void runBrowserEvidence(selectedArtifact.id)}
                  >
                    Run Evidence
                  </button>
                  <button className="tool-button" onClick={() => void sendArtifactPrompt("video-brief")}>
                    Video Brief
                  </button>
                  <button className="tool-button" onClick={() => void sendArtifactPrompt("design-memory")}>
                    Design DNA
                  </button>
                </div>
              </div>
              <div className="artifact-variant-studio">
                <div className="artifact-section-header">
                  <div>
                    <div className="inventory-section-title">Variant Studio</div>
                    <span>
                      {(selectedArtifact.variant_groups ?? []).length} groups · reversible A/B content for this artifact
                    </span>
                  </div>
                  <button
                    className="tool-button"
                    type="button"
                    disabled={saving}
                    onClick={() => void sendArtifactPrompt("variants")}
                  >
                    New Group
                  </button>
                </div>
                {(selectedArtifact.variant_groups ?? []).length === 0 && (
                  <div className="workbench-empty compact">
                    No variant groups yet. Start A/B Variants to create a persisted comparison set.
                  </div>
                )}
                {(selectedArtifact.variant_groups ?? []).map((group) => (
                  <div className="artifact-variant-group" key={group.id}>
                    <div className="artifact-variant-group-header">
                      <div>
                        <strong>{group.title}</strong>
                        <small>
                          {group.status}
                          {group.winner_variant_id ? ` · winner ${group.winner_variant_id}` : ""}
                        </small>
                      </div>
                      {selectedArtifact.type === "html" && (
                        <button
                          className="tool-button"
                          type="button"
                          disabled={saving || !htmlDraft.trim()}
                          onClick={() => void saveDraftVariant(group.id)}
                        >
                          Save Draft Variant
                        </button>
                      )}
                    </div>
                    {group.brief && <p className="artifact-variant-brief">{group.brief}</p>}
                    <div className="artifact-variant-grid">
                      {group.variants.map((variant) => (
                        <div
                          className={`artifact-variant-card ${group.winner_variant_id === variant.id ? "winner" : ""}`}
                          key={variant.id}
                        >
                          <div className="artifact-variant-card-header">
                            <span>{variant.label}</span>
                            <small>{variant.score !== null ? `${variant.score}/100` : "unscored"}</small>
                          </div>
                          <strong>{variant.title}</strong>
                          {variant.rationale && <p>{variant.rationale}</p>}
                          {selectedArtifact.type === "html" && variant.content_text && (
                            <iframe
                              title={`${variant.title} preview`}
                              srcDoc={sanitizedPreviewDoc(variant.content_text)}
                              sandbox="allow-same-origin"
                            />
                          )}
                          <button
                            className="primary-button"
                            type="button"
                            disabled={saving || group.winner_variant_id === variant.id || (!variant.has_content && !variant.file_path)}
                            onClick={() => void applyVariant(group.id, variant.id)}
                          >
                            Apply
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {selectedArtifact.content_text && selectedArtifact.revisions && selectedArtifact.revisions.length > 0 && (
                <div className="artifact-revision-diff">
                  <div className="artifact-section-header">
                    <div>
                      <div className="inventory-section-title">Revision Diff</div>
                      <span>
                        {selectedRevision
                          ? `v${selectedRevision.version} to current · +${revisionDiffSummary.added} / -${revisionDiffSummary.removed}`
                          : revisionContentPending
                            ? "Loading revision content for visual diff"
                            : "No content-bearing revision is available"}
                      </span>
                    </div>
                    <div className="artifact-diff-toolbar">
                      <select
                        value={selectedRevision?.version ?? ""}
                        disabled={revisionOptions.length === 0}
                        onChange={(event) => setSelectedRevisionVersion(Number(event.target.value))}
                        aria-label="Revision to compare"
                      >
                        {revisionOptions.map((revision) => (
                          <option key={revision.id} value={revision.version}>
                            v{revision.version} · {revision.event_type}
                          </option>
                        ))}
                      </select>
                      {revisionContentPending && (
                        <button
                          className="tool-button"
                          type="button"
                          onClick={() => void loadRevisions(selectedArtifact.id, true)}
                        >
                          Load Content
                        </button>
                      )}
                      {selectedRevision && (
                        <button
                          className="tool-button"
                          type="button"
                          disabled={saving}
                          onClick={() => void revertArtifact(selectedArtifact.id, selectedRevision.version)}
                        >
                          Revert v{selectedRevision.version}
                        </button>
                      )}
                    </div>
                  </div>
                  {selectedRevision ? (
                    <>
                      {selectedArtifact.type === "html" && selectedRevision.content_text && currentComparableContent && (
                        <div className="artifact-diff-preview-grid">
                          <div className="artifact-diff-frame">
                            <span>v{selectedRevision.version}</span>
                            <iframe
                              title={`${selectedArtifact.title} revision ${selectedRevision.version}`}
                              srcDoc={sanitizedPreviewDoc(selectedRevision.content_text)}
                              sandbox="allow-same-origin"
                            />
                          </div>
                          <div className="artifact-diff-frame">
                            <span>{htmlDraft !== (selectedArtifact.content_text ?? "") ? "Current draft" : "Current"}</span>
                            <iframe
                              title={`${selectedArtifact.title} current`}
                              srcDoc={sanitizedPreviewDoc(currentComparableContent)}
                              sandbox="allow-same-origin"
                            />
                          </div>
                        </div>
                      )}
                      <div className="artifact-diff-lines" role="table" aria-label="Revision line diff">
                        {revisionDiffRows.map((row, index) => (
                          <div className={`artifact-diff-row ${row.type}`} role="row" key={`${row.type}-${index}-${row.oldLine ?? row.newLine ?? "note"}`}>
                            <span className="artifact-diff-marker">
                              {row.type === "added" ? "+" : row.type === "removed" ? "-" : " "}
                            </span>
                            <span className="artifact-diff-line-no">
                              {row.type === "added"
                                ? row.newLine ?? ""
                                : row.type === "removed"
                                  ? row.oldLine ?? ""
                                  : row.oldLine && row.newLine
                                    ? `${row.oldLine}/${row.newLine}`
                                    : ""}
                            </span>
                            <code>{row.text || " "}</code>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="workbench-empty compact">
                      Revision content has not been loaded for this artifact yet.
                    </div>
                  )}
                </div>
              )}
              {selectedArtifact.events && selectedArtifact.events.length > 0 && (
                <div className="artifact-history">
                  <div className="inventory-section-title">Artifact History</div>
                  {selectedArtifact.events.map((event) => (
                    <div key={event.id} className="artifact-history-row">
                      <span>{event.type}</span>
                      <small>{new Date(event.created_at).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              )}
              {selectedArtifact.revisions && selectedArtifact.revisions.length > 0 && (
                <div className="artifact-history">
                  <div className="inventory-section-title">Artifact Revisions</div>
                  {selectedArtifact.revisions.map((revision) => (
                    <div key={revision.id} className="artifact-history-row">
                      <span>
                        v{revision.version} · {revision.event_type}
                        {revision.has_content ? " · content" : ""}
                      </span>
                      <small>{new Date(revision.created_at).toLocaleString()}</small>
                      <button
                        className="tool-button"
                        type="button"
                        disabled={saving || revision.version === selectedArtifact.revisions?.[0]?.version}
                        onClick={() => void revertArtifact(selectedArtifact.id, revision.version)}
                      >
                        Revert
                      </button>
                    </div>
                  ))}
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
