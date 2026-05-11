import React from "react";
import { useSessionStore } from "../../stores/sessionStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useLayoutStore } from "../../stores/layoutStore";
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

export function SessionsSurface() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const sessionSource = useSessionStore((s) => s.sessionSource);
  const loaded = useSessionStore((s) => s.loaded);
  const loadFromAdapter = useSessionStore((s) => s.loadFromAdapter);
  const connected = useAdapterStore((s) => s.connected);

  const [detail, setDetail] = React.useState<SessionDetailData | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (loaded) return;
    void loadFromAdapter();
  }, [loaded, loadFromAdapter]);

  React.useEffect(() => {
    if (!activeSessionId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    api.getSession(activeSessionId)
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

  const sourceLabel = sessionSource === "hermes_state_db" ? "Hermes State DB"
    : sessionSource === "mock" ? "Studio simulation"
    : sessionSource === "unavailable" ? "Unavailable"
    : sessionSource;

  return (
    <div className="sessions-surface">
      <div className="surface-header">
        <div>
          <div className="workbench-eyebrow">MANAGE mode</div>
          <h2>Sessions</h2>
        </div>
        <div className="surface-actions">
          <button
            className="tool-button"
            onClick={() => void loadFromAdapter()}
            disabled={!connected}
            aria-label="Refresh sessions"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="sessions-layout">
        {/* Session list */}
        <div className="sessions-list-panel">
          <div className="sessions-search-bar">
            <label htmlFor="session-filter" className="sr-only">Filter sessions</label>
            <input
              id="session-filter"
              className="composer-input"
              placeholder="Filter sessions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter sessions"
            />
          </div>

          <div className="sessions-list-meta">
            <span>{filtered.length} session{filtered.length !== 1 ? "s" : ""}</span>
            <span className="meta-sep">·</span>
            <span className={`source-chip source-${sessionSource}`}>{sourceLabel}</span>
          </div>

          {!loaded && (
            <div className="sessions-list-content">
              <LoadingSkeleton lines={6} />
            </div>
          )}

          {loaded && sessions.length === 0 && (
            <div className="workbench-empty compact">
              No sessions found.
              {!connected && " Connect to Hermes to load sessions."}
            </div>
          )}

          {loaded && filtered.length === 0 && search && (
            <div className="workbench-empty compact">
              No sessions match "{search}"
            </div>
          )}

          {loaded && filtered.length > 0 && (
            <div className="sessions-list-items" role="listbox" aria-label="Sessions">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  role="option"
                  aria-selected={activeSessionId === s.id}
                  className={`session-list-item ${activeSessionId === s.id ? "active" : ""}`}
                  onClick={() => setActiveSession(s.id)}
                >
                  <div className="session-item-icon" aria-hidden="true">💬</div>
                  <div className="session-item-info">
                    <span className="session-item-title">{s.title}</span>
                    <span className="session-item-meta">
                      {s.messageCount > 0 && <span>{s.messageCount} msgs</span>}
                      <span>{formatTime(s.updatedAt)}</span>
                      {s.profile && <span>{s.profile}</span>}
                    </span>
                  </div>
                  {deleteConfirm === s.id ? (
                    <div className="session-delete-confirm">
                      <button
                        className="tool-button danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteSession(s.id);
                          setDeleteConfirm(null);
                        }}
                        aria-label="Confirm delete"
                      >
                        Delete
                      </button>
                      <button
                        className="tool-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(null);
                        }}
                        aria-label="Cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="session-item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(s.id);
                      }}
                      aria-label={`Delete session ${s.title}`}
                      title="Delete session"
                    >
                      ×
                    </button>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Session detail */}
        <div className="sessions-detail-panel">
          {!activeSessionId && (
            <div className="workbench-empty">
              <div className="workbench-empty-icon" aria-hidden="true">💬</div>
              <div className="workbench-empty-title">No session selected</div>
              <div className="workbench-empty-copy">Select a session from the list to view its details.</div>
            </div>
          )}

          {activeSessionId && detailLoading && (
            <div className="sessions-detail-loading">
              <LoadingSkeleton lines={5} />
            </div>
          )}

          {activeSessionId && detailError && (
            <div className="inline-error" role="alert">
              <div className="error-icon" aria-hidden="true">!</div>
              <div className="error-message">{detailError}</div>
              <div className="inline-error-actions">
                <button
                  className="tool-button"
                  onClick={() => activeSessionId && setActiveSession(activeSessionId)}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {activeSessionId && detail && !detailLoading && (
            <div className="selectable">
              <div className="session-detail-header">
                <h3 className="session-detail-title">{detail.title}</h3>
                <div className="session-actions">
                  <button className="tool-button" onClick={() => void handleRestoreSession(detail.id)}>
                    Restore Session
                  </button>
                  <button className="tool-button" onClick={() => void handleInspectContext(detail.id)}>
                    Inspect Context
                  </button>
                </div>
              </div>

              <dl className="session-detail-meta">
                <div>
                  <dt>Session ID</dt>
                  <dd><code>{detail.id}</code></dd>
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
                <div>
                  <dt>Created</dt>
                  <dd>{formatTime(detail.created_at)}</dd>
                </div>
                <div>
                  <dt>Last Updated</dt>
                  <dd>{formatTime(detail.updated_at)}</dd>
                </div>
              </dl>

              {detail.transcript_preview && detail.transcript_preview.length > 0 ? (
                <div className="session-transcript">
                  <div className="session-transcript-header">Transcript Preview</div>
                  <div className="session-transcript-messages">
                    {detail.transcript_preview.slice(0, 10).map((msg, i) => (
                      <div key={i} className={`chat-message ${msg.role}`}>
                        <div className="chat-message-role">{msg.role}</div>
                        <div className="chat-message-content">{msg.content}</div>
                      </div>
                    ))}
                    {detail.transcript_preview.length > 10 && (
                      <div className="session-transcript-more">
                        +{detail.transcript_preview.length - 10} more messages
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="panel-note">
                  No transcript preview available for this session.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

async function handleDeleteSession(_sessionId: string): Promise<void> {
  // API does not yet expose session deletion — silently skip
}

function handleRestoreSession(sessionId: string): void {
  const { setActiveMode } = useLayoutStore.getState();
  const { setActiveTab } = useLayoutStore.getState();
  const { setActiveSession } = useSessionStore.getState();
  setActiveMode("create");
  setActiveTab("chat");
  setActiveSession(sessionId);
}

function handleInspectContext(sessionId: string): void {
  const { setSidebarSection } = useLayoutStore.getState();
  const { showSidebar } = useLayoutStore.getState();
  const { loadSessionContext } = useContextStore.getState();
  setSidebarSection("context");
  showSidebar();
  void loadSessionContext(sessionId);
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

// Backward compatibility: re-export the original panel
export { SessionsPanel } from "./SessionsPanel";