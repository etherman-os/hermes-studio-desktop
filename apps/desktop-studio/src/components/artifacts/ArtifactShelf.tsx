const ARTIFACT_CATEGORIES = [
  { id: "files", label: "Files", detail: "Changed files and generated local outputs" },
  { id: "markdown", label: "Markdown", detail: "Notes, plans, summaries, and reports" },
  { id: "screenshots", label: "Screenshots", detail: "Captured UI states and visual evidence" },
  { id: "tests", label: "Test Results", detail: "Command outcomes and verification traces" },
  { id: "log-snapshots", label: "Log Snapshots", detail: "Pinned runtime excerpts from adapter and Hermes logs" },
  { id: "html-previews", label: "HTML Previews", detail: "Rendered local previews from future artifact capture" },
  { id: "reports", label: "Reports", detail: "Structured handoff and audit documents" },
];

export function ArtifactShelf() {
  return (
    <div className="artifact-shelf">
      <div className="surface-header">
        <div>
          <div className="workbench-eyebrow">Artifact Shelf</div>
          <h2>Run outputs will land here</h2>
        </div>
        <span className="surface-badge">v0 placeholder</span>
      </div>
      <div className="artifact-grid">
        {ARTIFACT_CATEGORIES.map((category) => (
          <div key={category.id} className="artifact-tile">
            <div className="artifact-tile-title">{category.label}</div>
            <div className="artifact-tile-detail">{category.detail}</div>
            <div className="artifact-tile-count">0 captured</div>
          </div>
        ))}
      </div>
    </div>
  );
}
