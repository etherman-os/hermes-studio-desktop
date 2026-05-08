import React from "react";
import { useSessionStore } from "../../stores/sessionStore";
import { useThemeStore } from "../../stores/themeStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useKanbanStore } from "../../stores/kanbanStore";
import { useArtifactStore } from "../../stores/artifactStore";
import { useContextStore } from "../../stores/contextStore";
import { LoadingSkeleton } from "../Skeleton";
import * as api from "../../api/studioClient";

interface SessionDetailData {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  profile?: string;
  transcript_preview?: { role: string; content: string }[];
}

export function SessionsPanel() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const sessionSource = useSessionStore((s) => s.sessionSource);
  const loaded = useSessionStore((s) => s.loaded);
  const label = useThemeStore((s) => s.label);
  const icon = useThemeStore((s) => s.icon);
  const runs = useRunLedgerStore((s) => s.runs);
  const selectRun = useRunLedgerStore((s) => s.selectRun);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);

  const [detail, setDetail] = React.useState<SessionDetailData | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (!activeSessionId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    api
      .getSession(activeSessionId)
      .then((data) => {
        setDetail(data as SessionDetailData);
        setDetailLoading(false);
      })
      .catch((err) => {
        setDetailError(err.message ?? "Failed to load session");
        setDetailLoading(false);
      });
  }, [activeSessionId]);

  const filtered = search
    ? sessions.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : sessions;
  const relatedRun = detail ? runs.find((run) => run.sessionId === detail.id) : null;
  const createKanbanCard = useKanbanStore((s) => s.createCard);
  const kanbanSaving = useKanbanStore((s) => s.saving);
  const kanbanMessage = useKanbanStore((s) => s.actionMessage);
  const kanbanError = useKanbanStore((s) => s.error);
  const createArtifact = useArtifactStore((s) => s.createArtifact);
  const artifactSaving = useArtifactStore((s) => s.saving);
  const artifactMessage = useArtifactStore((s) => s.actionMessage);
  const artifactError = useArtifactStore((s) => s.error);
  const loadSessionContext = useContextStore((s) => s.loadSessionContext);
  const setSidebarSection = useLayoutStore((s) => s.setSidebarSection);
  const showSidebar = useLayoutStore((s) => s.showSidebar);

  async function createCardFromSession() {
    if (!detail) return;
    await createKanbanCard({
      title: detail.title,
      description: `Created from Hermes session ${detail.id}`,
      priority: "medium",
      session_id: detail.id,
    });
  }

  async function createArtifactFromSession() {
    if (!detail) return;
    const preview = detail.transcript_preview?.map((message) => `- ${message.role}: ${message.content}`).join("\n") || "- No transcript preview available";
    const artifact = await createArtifact({
      title: `Session summary: ${detail.title}`,
      type: "markdown",
      description: `Created from Hermes session ${detail.id}`,
      content_text: [
        "# Session Summary",
        "",
        `- Session ID: ${detail.id}`,
        `- Title: ${detail.title}`,
        `- Messages: ${detail.message_count}`,
        `- Profile: ${detail.profile ?? "unknown"}`,
        `- Created: ${detail.created_at}`,
        `- Updated: ${detail.updated_at}`,
        "",
        "## Transcript Preview",
        "",
        preview,
      ].join("\n"),
      session_id: detail.id,
      source: "session",
    });
    if (artifact) setActiveTab("artifacts");
  }

  async function inspectSessionContext() {
    if (!detail) return;
    setSidebarSection("context");
    showSidebar();
    await loadSessionContext(detail.id);
  }

  if (!loaded) {
    return (
      <div className="empty-state">
        <LoadingSkeleton lines={5} />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="empty-state" role="status">
        <div className="empty-state-icon" aria-hidden="true">{icon("sessions")}</div>
        <div className="empty-state-text">No sessions found</div>
        <div style={{ fontSize: "var(--app-font-size-sm)", color: "var(--app-text-muted)", marginTop: "var(--app-spacing-xs)" }}>
          {sessionSource === "unavailable"
            ? "Session data unavailable — adapter may need Hermes state.db"
            : "Start a conversation to create your first session"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", gap: "var(--app-spacing-md)" }}>
      <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "var(--app-spacing-sm)", borderBottom: "1px solid var(--app-border-subtle)" }}>
          <label htmlFor="session-filter" className="sr-only">Filter sessions</label>
          <input
            id="session-filter"
            className="composer-input"
            placeholder="Filter sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
            aria-label="Filter sessions"
          />
        </div>

        <div style={{ padding: "var(--app-spacing-xs) var(--app-spacing-sm)", fontSize: "10px", color: "var(--app-text-muted)" }}>
          {filtered.length} sessions · {sessionSource === "hermes_state_db" ? "Hermes" : sessionSource === "mock" ? "Studio" : "Unknown"}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "var(--app-spacing-xs)" }} role="listbox" aria-label="Sessions">
          {filtered.map((s) => (
            <button
              key={s.id}
              role="option"
              aria-selected={activeSessionId === s.id}
              className={`sidebar-item ${activeSessionId === s.id ? "active" : ""}`}
              onClick={() => setActiveSession(s.id)}
              style={{ flexDirection: "column", alignItems: "flex-start", gap: "2px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--app-spacing-sm)", width: "100%" }}>
                <span aria-hidden="true">💬</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                  {s.title}
                </span>
              </div>
              <div style={{ display: "flex", gap: "var(--app-spacing-md)", fontSize: "10px", color: "var(--app-text-muted)", paddingLeft: 28 }}>
                {s.messageCount > 0 && <span>{s.messageCount} msgs</span>}
                {s.updatedAt && <span>{formatTime(s.updatedAt)}</span>}
                {s.profile && <span>{s.profile}</span>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && search && (
            <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center", fontSize: "var(--app-font-size-sm)" }} role="status">
              No sessions match "{search}"
            </div>
          )}
        </div>
      </div>

      {/* Session detail */}
      <div style={{ flex: 1, overflow: "auto", borderLeft: "1px solid var(--app-border-subtle)", paddingLeft: "var(--app-spacing-md)" }}>
        {!activeSessionId && (
          <div className="empty-state">
            <div className="empty-state-text">Select a session to view details</div>
          </div>
        )}
        {activeSessionId && detailLoading && (
          <div className="empty-state">
            <LoadingSkeleton lines={4} />
          </div>
        )}
        {activeSessionId && detailError && (
          <div className="error-container" role="alert">
            <div className="error-icon" aria-hidden="true">!</div>
            <div className="error-message">{detailError}</div>
            <div className="error-actions">
              <button className="retry-button" onClick={() => activeSessionId && setActiveSession(activeSessionId)}>Retry</button>
            </div>
          </div>
        )}
        {activeSessionId && detail && !detailLoading && (
          <div className="selectable">
            {/* Metadata */}
            <div style={{ marginBottom: "var(--app-spacing-md)" }}>
              <h3 style={{ fontSize: "var(--app-font-size-lg)", fontWeight: 600, marginBottom: "var(--app-spacing-xs)" }}>
                {detail.title}
              </h3>
              <div className="session-actions">
                <button className="tool-button" disabled={kanbanSaving} onClick={() => void createCardFromSession()}>
                  {kanbanSaving ? "Creating Card" : "Create Card from Session"}
                </button>
                <button className="tool-button" disabled={artifactSaving} onClick={() => void createArtifactFromSession()}>
                  {artifactSaving ? "Creating Artifact" : "Create Artifact from Session"}
                </button>
                <button className="tool-button" onClick={() => void inspectSessionContext()}>Inspect Context</button>
                <button
                  className="tool-button"
                  disabled={!relatedRun}
                  onClick={() => {
                    if (!relatedRun) return;
                    selectRun(relatedRun.runId);
                    setActiveTab("runs");
                  }}
                >
                  Open Related Run
                </button>
              </div>
              {(kanbanMessage || kanbanError) && (
                <div className={`run-ledger-notice ${kanbanError ? "warning" : ""}`}>
                  {kanbanError ? `Kanban unavailable: ${kanbanError}` : kanbanMessage}
                </div>
              )}
              {(artifactMessage || artifactError) && (
                <div className={`run-ledger-notice ${artifactError ? "warning" : ""}`}>
                  {artifactError ? `Artifacts unavailable: ${artifactError}` : artifactMessage}
                </div>
              )}
              <dl className="right-panel-info" style={{ display: "flex", flexWrap: "wrap", gap: "var(--app-spacing-md)" }}>
                <div>
                  <dt>ID</dt>
                  <dd>{detail.id}</dd>
                </div>
                {detail.message_count > 0 && (
                  <div>
                    <dt>Messages</dt>
                    <dd>{detail.message_count}</dd>
                  </div>
                )}
                {detail.profile && (
                  <div>
                    <dt>Profile</dt>
                    <dd>{detail.profile}</dd>
                  </div>
                )}
                {detail.created_at && (
                  <div>
                    <dt>Created</dt>
                    <dd>{formatTime(detail.created_at)}</dd>
                  </div>
                )}
                {detail.updated_at && (
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatTime(detail.updated_at)}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Transcript preview */}
            {detail.transcript_preview && detail.transcript_preview.length > 0 && (
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--app-text-muted)", marginBottom: "var(--app-spacing-sm)" }}>
                  Transcript Preview
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--app-spacing-sm)" }}>
                  {detail.transcript_preview.map((msg, i) => (
                    <div
                      key={i}
                      className={`chat-message ${msg.role}`}
                      style={{ maxWidth: "95%", fontSize: "var(--app-font-size-sm)" }}
                    >
                      <div className="chat-message-role">{msg.role}</div>
                      <div className="chat-message-content">{msg.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!detail.transcript_preview || detail.transcript_preview.length === 0) && (
              <div style={{ color: "var(--app-text-muted)", fontSize: "var(--app-font-size-sm)", fontStyle: "italic" }}>
                No transcript preview available for this session
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
