import { useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useProfileStore } from "../../stores/profileStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUiStore } from "../../stores/uiStore";
import { ContextInspector } from "../context/ContextInspector";
import { RuntimeStatus } from "../runtime/RuntimeStatus";

export function LeftSidebar() {
  const section = useLayoutStore((s) => s.sidebarSection);
  const label = useThemeStore((s) => s.label);
  const icon = useThemeStore((s) => s.icon);

  return (
    <div className="sidebar">
      <div className="sidebar-header">{label(section)}</div>
      <div className="sidebar-content">
        {section === "runs" && <RunsList />}
        {section === "chat" && <ChatSection />}
        {section === "board" && <BoardSection />}
        {section === "sessions" && <SessionsList />}
        {section === "artifacts" && <ArtifactsSection />}
        {section === "context" && <ContextSection />}
        {section === "logs" && <LogsSection />}
        {section === "profiles" && <ProfilesList />}
        {section === "search" && <SearchSection />}
        {section === "theme_gallery" && <ThemeGallerySection />}
        {section === "settings" && <SettingsSection />}
        {!["runs", "chat", "board", "sessions", "artifacts", "context", "logs", "profiles", "search", "theme_gallery", "settings"].includes(section) && (
          <div className="empty-state">
            <div className="empty-state-icon">{icon(section)}</div>
            <div className="empty-state-text">{label(section)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function RunsList() {
  const runs = useRunLedgerStore((s) => s.runs);
  const currentRunId = useRunLedgerStore((s) => s.currentRunId);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const openNewRun = useUiStore((s) => s.openNewRun);

  if (runs.length === 0) {
    return (
      <div className="sidebar-stack">
        <button className="primary-button" onClick={openNewRun}>New Run</button>
        <div className="sidebar-note">No runs captured in this Studio session.</div>
      </div>
    );
  }

  return (
    <>
      <button className="primary-button sidebar-primary" onClick={openNewRun}>New Run</button>
      <div className="sidebar-note">{runs.length} recent run{runs.length !== 1 ? "s" : ""}</div>
      {runs.map((run) => (
        <button
          key={run.runId}
          className={`sidebar-item ${currentRunId === run.runId ? "active" : ""}`}
          onClick={() => setActiveTab("runs")}
          title={run.prompt}
        >
          <span className={`mini-status status-${run.status}`} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {run.prompt || run.runId}
          </span>
          <span style={{ fontSize: "10px", color: "var(--app-text-muted)", flexShrink: 0 }}>{run.events.length}</span>
        </button>
      ))}
    </>
  );
}

function ChatSection() {
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const openNewRun = useUiStore((s) => s.openNewRun);
  return (
    <div className="sidebar-stack">
      <button className="primary-button" onClick={openNewRun}>New Chat / Run</button>
      <button className="sidebar-item active" onClick={() => setActiveTab("chat")}>Composer</button>
      <button className="sidebar-item" onClick={() => setActiveTab("runs")}>Run Ledger</button>
      <div className="sidebar-note">Chat is a prompt surface. Run state, tools, warnings, and outcomes are tracked in the ledger.</div>
    </div>
  );
}

function BoardSection() {
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  return (
    <div className="sidebar-stack">
      <button className="sidebar-item active" onClick={() => setActiveTab("board")}>Run Board</button>
      <div className="sidebar-note">Board cards persist in Studio storage and can link to runs or sessions. Movement uses explicit controls; drag-and-drop remains future work.</div>
    </div>
  );
}

function ArtifactsSection() {
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  return (
    <div className="sidebar-stack">
      <button className="sidebar-item active" onClick={() => setActiveTab("artifacts")}>Artifact Shelf</button>
      {["Files", "Markdown", "Screenshots", "Test Results", "Reports"].map((item) => (
        <button key={item} className="sidebar-item" onClick={() => setActiveTab("artifacts")}>{item}</button>
      ))}
    </div>
  );
}

function ContextSection() {
  return (
    <div className="sidebar-embedded">
      <ContextInspector />
    </div>
  );
}

function LogsSection() {
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  return (
    <div className="sidebar-stack">
      {["activity", "tools", "logs", "adapter_diagnostics"].map((tab) => (
        <button key={tab} className="sidebar-item" onClick={() => setBottomTab(tab)}>
          {tab.replaceAll("_", " ")}
        </button>
      ))}
    </div>
  );
}

function SessionsList() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const setActive = useSessionStore((s) => s.setActiveSession);
  const sessionSource = useSessionStore((s) => s.sessionSource);
  const loaded = useSessionStore((s) => s.loaded);

  return (
    <>
      {loaded && sessions.length === 0 && (
        <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", fontSize: "var(--app-font-size-sm)", textAlign: "center" }}>
          No sessions found
        </div>
      )}
      {sessions.map((s) => (
        <button
          key={s.id}
          className={`sidebar-item ${activeId === s.id ? "active" : ""}`}
          onClick={() => setActive(s.id)}
          title={`${s.title}\n${s.messageCount} messages`}
        >
          <span>💬</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {s.title}
          </span>
          {s.messageCount > 0 && (
            <span style={{ fontSize: "10px", color: "var(--app-text-muted)", flexShrink: 0 }}>
              {s.messageCount}
            </span>
          )}
        </button>
      ))}
    </>
  );
}

function ProfilesList() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const profileCount = useProfileStore((s) => s.profileCount);
  const loaded = useProfileStore((s) => s.loaded);
  const activateError = useProfileStore((s) => s.activateError);
  const activateProfile = useProfileStore((s) => s.activateProfile);

  if (!loaded) {
    return <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center" }}>Loading...</div>;
  }

  if (profiles.length === 0) {
    return (
      <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", fontSize: "var(--app-font-size-sm)", textAlign: "center" }}>
        No profiles found
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: "var(--app-spacing-xs) var(--app-spacing-sm)", fontSize: "10px", color: "var(--app-text-muted)" }}>
        {profileCount} profile{profileCount !== 1 ? "s" : ""}
      </div>
      {activateError && (
        <div style={{ padding: "var(--app-spacing-xs) var(--app-spacing-sm)", fontSize: "11px", color: "var(--app-warn)", background: "rgba(210,153,34,0.1)", borderRadius: "var(--app-radius-sm)", margin: "0 var(--app-spacing-xs)" }}>
          {activateError}
        </div>
      )}
      {profiles.map((p) => (
        <button
          key={p.id}
          className={`sidebar-item ${p.name === activeProfile?.name ? "active" : ""}`}
          onClick={() => {
            if (p.name !== activeProfile?.name) {
              activateProfile(p.name);
            }
          }}
        >
          <span>{p.name === activeProfile?.name ? "●" : "○"}</span>
          <span>{p.name}</span>
        </button>
      ))}
    </>
  );
}

function SearchSection() {
  return (
    <div style={{ padding: "var(--app-spacing-sm)" }}>
      <input
        className="composer-input"
        placeholder="Search sessions..."
        style={{ width: "100%" }}
      />
    </div>
  );
}

function ThemeGallerySection() {
  const themes = useThemeStore((s) => s.themes);
  const adapterThemes = useThemeStore((s) => s.adapterThemes);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const activateTheme = useThemeStore((s) => s.activateTheme);
  const reloadThemes = useThemeStore((s) => s.reloadThemes);
  const loading = useThemeStore((s) => s.loading);
  const error = useThemeStore((s) => s.error);
  const adapterLoaded = useThemeStore((s) => s.adapterLoaded);
  const connected = useAdapterStore((s) => s.connected);

  // Use adapter themes if available, otherwise local
  const themeList = adapterThemes.length > 0
    ? adapterThemes.map((at) => ({
        id: at.id,
        name: at.name,
        description: at.description || "",
        author: at.author || "",
        version: at.version || "",
        source: (at as { source?: string }).source ?? "built-in",
        valid: (at as { valid?: boolean }).valid ?? true,
        warnings: (at as { warnings?: string[] }).warnings ?? [],
        accent: themes[at.id]?.palette?.accent ?? "#58a6ff",
      }))
    : Object.values(themes).map((t) => ({
        id: t.meta.id,
        name: t.meta.name,
        description: t.meta.description ?? "",
        author: t.meta.author ?? "",
        version: t.meta.version ?? "",
        source: "local-fallback",
        valid: true,
        warnings: [] as string[],
        accent: t.palette?.accent ?? "#58a6ff",
      }));

  return (
    <div className="theme-switcher-panel">
      {/* Header with reload */}
      <div style={{ padding: "var(--app-spacing-xs) var(--app-spacing-sm)", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--app-border-subtle)" }}>
        <span style={{ fontSize: "10px", color: "var(--app-text-muted)" }}>
          {themeList.length} theme{themeList.length !== 1 ? "s" : ""}
          {adapterLoaded && adapterThemes.length > 0 ? " (adapter)" : " (local)"}
        </span>
        <button
          onClick={() => reloadThemes()}
          disabled={loading}
          style={{ background: "transparent", border: "none", color: loading ? "var(--app-text-muted)" : "var(--app-accent)", cursor: loading ? "default" : "pointer", fontSize: "11px", padding: "2px 6px" }}
          title="Reload themes from disk"
        >
          {loading ? "..." : "↻ Reload"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "var(--app-spacing-xs) var(--app-spacing-sm)", fontSize: "11px", color: "var(--app-danger)", background: "rgba(248,81,73,0.1)" }}>
          {error}
        </div>
      )}

      {/* Theme list */}
      {themeList.map((t) => (
        <button
          key={t.id}
          className={`theme-card ${activeThemeId === t.id ? "active" : ""}`}
          onClick={() => activateTheme(t.id)}
          style={{ opacity: t.valid ? 1 : 0.7 }}
        >
          <div
            className="theme-swatch"
            style={{ background: t.accent }}
          />
          <div className="theme-card-info">
            <div className="theme-card-name">
              {t.name}
              {!t.valid && <span style={{ color: "var(--app-warn)", marginLeft: 4, fontSize: "10px" }}>⚠</span>}
              {activeThemeId === t.id && <span style={{ color: "var(--app-ok)", marginLeft: 4, fontSize: "10px" }}>●</span>}
            </div>
            <div className="theme-card-desc">{t.description}</div>
            <div style={{ display: "flex", gap: "var(--app-spacing-sm)", fontSize: "10px", color: "var(--app-text-muted)", marginTop: 2 }}>
              {t.author && <span>{t.author}</span>}
              {t.version && <span>v{t.version}</span>}
              <span>{t.source}</span>
            </div>
            {t.warnings.length > 0 && (
              <div style={{ fontSize: "10px", color: "var(--app-warn)", marginTop: 2 }}>
                {t.warnings[0]}
              </div>
            )}
          </div>
        </button>
      ))}

      {/* Empty state */}
      {themeList.length === 0 && !loading && (
        <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center", fontSize: "var(--app-font-size-sm)" }}>
          No themes found
        </div>
      )}
    </div>
  );
}

function SettingsSection() {
  const openWorkspacePicker = useUiStore((s) => s.openWorkspacePicker);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  return (
    <div className="sidebar-stack">
      <button className="primary-button" onClick={openWorkspacePicker}>Select Workspace</button>
      <div className="sidebar-note">Workspace: {selectedWorkspace ?? "none selected"}</div>
      <RuntimeStatus />
    </div>
  );
}
