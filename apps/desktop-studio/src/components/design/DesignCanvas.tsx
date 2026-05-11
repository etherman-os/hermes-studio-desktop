import React from "react";
import type { ArtifactType } from "../../api/studioClient";
import { useArtifactStore } from "../../stores/artifactStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useRunStore } from "../../stores/runStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { sanitizedPreviewDoc } from "../../utils/previewDocument";
import "./DesignCanvas.css";

type ImportKind = "html" | "screenshot" | "url" | "figma" | "json" | "markdown";

const TYPE_BY_KIND: Record<ImportKind, ArtifactType> = {
  html: "html",
  screenshot: "screenshot",
  url: "file_reference",
  figma: "file_reference",
  json: "json",
  markdown: "markdown",
};

export function DesignCanvas() {
  const artifacts = useArtifactStore((s) => s.artifacts);
  const selectedArtifact = useArtifactStore((s) => s.selectedArtifact);
  const selectedArtifactId = useArtifactStore((s) => s.selectedArtifactId);
  const loadArtifacts = useArtifactStore((s) => s.loadArtifacts);
  const selectArtifact = useArtifactStore((s) => s.selectArtifact);
  const createArtifact = useArtifactStore((s) => s.createArtifact);
  const saving = useArtifactStore((s) => s.saving);
  const error = useArtifactStore((s) => s.error);
  const sendPrompt = useRunStore((s) => s.sendPrompt);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const skills = useHermesInventoryStore((s) => s.skills);
  const toolsets = useHermesInventoryStore((s) => s.toolsets);
  const [kind, setKind] = React.useState<ImportKind>("html");
  const [title, setTitle] = React.useState("Untitled design import");
  const [content, setContent] = React.useState("");
  const [brief, setBrief] = React.useState("Turn this into a polished, production-ready local app experience.");
  const [importing, setImporting] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    void loadArtifacts({ limit: 100 });
  }, [loadArtifacts]);

  const designArtifacts = artifacts.filter((artifact) => ["html", "screenshot", "json", "markdown", "file_reference"].includes(artifact.type));
  const designSkills = skills
    .filter((skill) => skill.installed && ["creative", "software-development", "github"].some((category) => skill.category.includes(category)))
    .slice(0, 4)
    .map((skill) => skill.cli_name || skill.name || skill.id);
  const designToolsets = toolsets
    .filter((toolset) => ["browser", "web", "file", "vision", "image_gen", "code_execution"].includes(toolset.id) || toolset.id.includes("figma"))
    .map((toolset) => toolset.id);
  const selectedPreviewDoc = React.useMemo(() => (
    selectedArtifact?.type === "html" && selectedArtifact.content_text
      ? sanitizedPreviewDoc(selectedArtifact.content_text)
      : ""
  ), [selectedArtifact?.type, selectedArtifact?.content_text]);
  const sourceValidation = React.useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) return { state: "empty", label: "Waiting for source", detail: "Paste a source, URL, file path, or brief to start intake." };
    if (kind === "json") {
      try {
        JSON.parse(trimmed);
        return { state: "valid", label: "JSON valid", detail: "Structured spec is ready to import." };
      } catch {
        return { state: "invalid", label: "JSON needs attention", detail: "The design spec must parse before import." };
      }
    }
    if (kind === "figma") {
      return /^https:\/\/(www\.)?figma\.com\//i.test(trimmed)
        ? { state: "valid", label: "Figma link ready", detail: "Hermes can hand this to configured Figma or browser tools." }
        : { state: "invalid", label: "Expected Figma URL", detail: "Use a figma.com file, design, or proto URL." };
    }
    if (kind === "url") {
      return /^(https?:\/\/|file:\/\/|\/|\.\/|\.\.\/)/i.test(trimmed)
        ? { state: "valid", label: "Reference ready", detail: "Local URL or file path can be stored as a source reference." }
        : { state: "invalid", label: "Expected URL or path", detail: "Use http://, https://, file://, /path, ./path, or ../path." };
    }
    if (kind === "html") {
      return /<\/?[a-z][\s\S]*>/i.test(trimmed)
        ? { state: "valid", label: "HTML detected", detail: "Inline markup can be sanitized for preview and handoff." }
        : { state: "warn", label: "HTML not obvious", detail: "Import is allowed, but paste markup for a richer preview." };
    }
    return { state: "valid", label: "Source ready", detail: "The intake content can be imported and handed off." };
  }, [content, kind]);
  const briefValidation = React.useMemo(() => {
    const trimmed = brief.trim();
    if (trimmed.length < 24) return { state: "warn", label: "Brief is thin", detail: "Add goals, constraints, audience, or acceptance criteria before generation." };
    return { state: "valid", label: "Brief ready", detail: "Handoff has enough direction for Hermes to act." };
  }, [brief]);
  const canImport = sourceValidation.state !== "empty" && sourceValidation.state !== "invalid";

  async function importDesign() {
    const trimmed = content.trim();
    if (!trimmed || !canImport) return null;
    setImporting(true);
    try {
      const artifact = await createArtifact({
        title: title.trim() || "Design import",
        type: TYPE_BY_KIND[kind],
        description: `Design Canvas import: ${kind}`,
        content_text: kind === "url" || kind === "figma" ? null : trimmed,
        file_path: kind === "url" || kind === "figma" ? trimmed : null,
        mime_type: kind === "html" ? "text/html" : kind === "json" ? "application/json" : "text/plain",
        source: "design_canvas",
        session_id: activeSessionId,
      });
      if (artifact) void loadArtifacts({ limit: 100 });
      return artifact;
    } finally {
      setImporting(false);
    }
  }

  async function importAndGenerate() {
    setGenerating(true);
    try {
      const artifact = await importDesign();
      if (!artifact) return;
      setActiveTab("chat");
      await sendPrompt(
        [
          "Hermes Design Canvas request",
          `Imported artifact: ${artifact.title} (${artifact.id})`,
          `Source kind: ${kind}`,
          artifact.file_path ? `Source reference: ${artifact.file_path}` : "",
          artifact.content_text ? `Source excerpt:\n${artifact.content_text.slice(0, 2200)}` : "",
          `Production brief:\n${brief.trim()}`,
          kind === "figma" ? "If a local Figma MCP/tool is configured in Hermes, use it. Otherwise inspect the URL with browser/vision tools and produce an implementation-ready reconstruction plan." : "",
          "Use local Hermes tools, browser checks, project files, and checkpoints where available. Return implementation steps, generated artifacts, and verification evidence.",
        ].filter(Boolean).join("\n\n"),
        activeSessionId ?? "default",
        {
          workspacePath: selectedWorkspace,
          mode: "design",
          skills: designSkills,
          toolsets: designToolsets,
        },
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="design-canvas">
      <div className="design-canvas-header">
        <div>
          <div className="workbench-eyebrow">Design Canvas</div>
          <h2>Import, inspect, and hand off visual work to Hermes</h2>
        </div>
        <div className="design-canvas-actions">
          <button className="tool-button" disabled={saving || importing || generating || !canImport} onClick={() => void importDesign()}>
            {importing ? "Importing" : "Import Artifact"}
          </button>
          <button className="primary-button" disabled={saving || importing || generating || !canImport} onClick={() => void importAndGenerate()}>
            {generating ? "Generating" : "Import + Generate"}
          </button>
        </div>
      </div>

      {error && <div className="inline-warning">{error}</div>}

      <div className="design-canvas-grid">
        <section className="design-import-panel">
          <div className="design-panel-heading">
            <div>
              <div className="inventory-section-title">Import Source</div>
              <span>Validate the intake before it becomes an artifact.</span>
            </div>
            <span className={`design-status-pill ${sourceValidation.state}`}>{sourceValidation.label}</span>
          </div>
          <div className={`design-validation-card ${sourceValidation.state}`}>
            <strong>{sourceValidation.label}</strong>
            <span>{sourceValidation.detail}</span>
          </div>
          <div className="design-form-grid">
            <label>
              <span>Kind</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as ImportKind)}>
                <option value="html">HTML / React output</option>
                <option value="screenshot">Screenshot notes</option>
                <option value="url">Local URL or file path</option>
                <option value="figma">Figma URL</option>
                <option value="json">JSON design spec</option>
                <option value="markdown">Markdown brief</option>
              </select>
            </label>
            <label>
              <span>Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
          </div>
          <textarea
            className="studio-textarea design-source-textarea"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={kind === "url" ? "http://127.0.0.1:3000 or /path/to/file" : kind === "figma" ? "https://www.figma.com/file/..." : "Paste HTML, JSON, markdown, screenshot notes, or a design brief"}
          />
          <div className="design-panel-heading">
            <div>
              <div className="inventory-section-title">Brief & Handoff</div>
              <span>Tell Hermes what success looks like after import.</span>
            </div>
            <span className={`design-status-pill ${briefValidation.state}`}>{briefValidation.label}</span>
          </div>
          <textarea
            className="studio-textarea design-brief-textarea"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="Production brief"
          />
          <div className={`design-validation-card ${briefValidation.state}`}>
            <strong>{briefValidation.label}</strong>
            <span>{briefValidation.detail}</span>
          </div>
        </section>

        <section className="design-preview-panel selectable">
          <div className="design-panel-heading">
            <div>
              <div className="inventory-section-title">Selected Design Artifact</div>
              <span>Confirm the artifact that will be handed off or iterated.</span>
            </div>
          </div>
          {selectedArtifact ? (
            <>
              <div className="event-detail-title">{selectedArtifact.title}</div>
              <dl className="event-detail-meta">
                <dt>Type</dt>
                <dd>{selectedArtifact.type}</dd>
                <dt>Source</dt>
                <dd>{selectedArtifact.source}</dd>
                <dt>Artifact</dt>
                <dd>{selectedArtifact.id}</dd>
              </dl>
              {selectedArtifact.type === "html" && selectedArtifact.content_text ? (
                <iframe className="design-preview-frame" title={selectedArtifact.title} srcDoc={selectedPreviewDoc} sandbox="" />
              ) : (
                <pre className="event-payload">{(selectedArtifact.content_text ?? selectedArtifact.file_path ?? "").slice(0, 3000)}</pre>
              )}
            </>
          ) : (
            <div className="workbench-empty compact">Select or import a design artifact.</div>
          )}
        </section>

        <section className="design-artifact-list">
          <div className="design-panel-heading">
            <div>
              <div className="inventory-section-title">Design Imports</div>
              <span>{designArtifacts.length} recent intake artifacts</span>
            </div>
          </div>
          <div className="design-handoff-card">
            <span>Generate handoff</span>
            <strong>{designSkills.length} skills · {designToolsets.length} tools</strong>
            <small>{selectedWorkspace || "No workspace selected"}</small>
          </div>
          <div className="mission-list">
            {designArtifacts.slice(0, 12).map((artifact) => (
              <button
                key={artifact.id}
                className={`mission-list-row ${selectedArtifactId === artifact.id ? "active" : ""}`}
                onClick={() => void selectArtifact(artifact.id)}
              >
                <span>{artifact.title}</span>
                <small>{artifact.type}</small>
              </button>
            ))}
            {designArtifacts.length === 0 && <div className="panel-note">No design imports yet</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
