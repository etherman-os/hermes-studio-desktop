import React from "react";
import { SIDEBAR_SECTIONS, useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useProfileStore } from "../../stores/profileStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUiStore } from "../../stores/uiStore";
import { ApprovalCenter } from "../approvals/ApprovalCenter";
import { ContextInspector } from "../context/ContextInspector";
import { CronPanel } from "../cron/CronPanel";
import { DelegationPanel } from "../delegation/DelegationPanel";
import { ExtensionsPanel } from "../extensions/ExtensionsPanel";
import { RuntimeStatus } from "../runtime/RuntimeStatus";
import { LoadingSkeleton } from "../Skeleton";

export function LeftSidebar() {
  const section = useLayoutStore((s) => s.sidebarSection);
  const label = useThemeStore((s) => s.label);
  const icon = useThemeStore((s) => s.icon);

  return (
    <aside className="sidebar" role="complementary" aria-label={`${label(section)} sidebar`}>
      <div className="sidebar-header" id="sidebar-heading">{label(section)}</div>
      <div className="sidebar-content" aria-labelledby="sidebar-heading">
        {section === "runs" && <RunsList />}
        {section === "chat" && <ChatSection />}
        {section === "board" && <BoardSection />}
        {section === "sessions" && <SessionsList />}
        {section === "artifacts" && <ArtifactsSection />}
        {section === "checkpoints" && <GitSection />}
        {section === "worktrees" && <GitSection />}
        {section === "context" && <ContextSection />}
        {section === "approvals" && <ApprovalsSection />}
        {section === "extensions" && <ExtensionsSection />}
        {section === "delegations" && <DelegationsSection />}
        {section === "cron" && <CronSection />}
        {section === "logs" && <LogsSection />}
        {section === "profiles" && <ProfilesList />}
        {section === "theme_gallery" && <ThemeGallerySection />}
        {section === "settings" && <SettingsSection />}
        {!SIDEBAR_SECTIONS.includes(section) && (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">{icon(section)}</div>
            <div className="empty-state-text">{label(section)}</div>
          </div>
        )}
      </div>
    </aside>
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
        <button className="primary-button" onClick={openNewRun} aria-label="Create new run">New Run</button>
        <div className="empty-state" style={{ padding: "var(--app-spacing-md)" }}>
          <div className="workbench-empty-icon" aria-hidden="true">R</div>
          <div className="sidebar-note">No runs captured in this Studio session.</div>
          <div className="empty-state-action">
            <button className="tool-button" onClick={openNewRun}>Start your first run</button>
          </div>
        </div>
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

function GitSection() {
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  return (
    <div className="sidebar-stack">
      <button className="sidebar-item active" onClick={() => setActiveTab("checkpoints")}>Checkpoints</button>
      <button className="sidebar-item" onClick={() => setActiveTab("worktrees")}>Worktrees</button>
      <div className="sidebar-note">Git checkpoints and worktrees for managing code changes during runs.</div>
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

function ApprovalsSection() {
  return (
    <div className="sidebar-embedded">
      <ApprovalCenter />
    </div>
  );
}

function ExtensionsSection() {
  return (
    <div className="sidebar-embedded">
      <ExtensionsPanel />
    </div>
  );
}

function DelegationsSection() {
  return (
    <div className="sidebar-embedded">
      <DelegationPanel />
    </div>
  );
}

function CronSection() {
  return (
    <div className="sidebar-embedded">
      <CronPanel />
    </div>
  );
}

function LogsSection() {
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  return (
    <div className="sidebar-stack">
      {["activity", "logs"].map((tab) => (
        <button key={tab} className="sidebar-item" onClick={() => setBottomTab(tab)}>
          {tab}
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
    return <LoadingSkeleton lines={4} />;
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
    <div className="theme-switcher-panel" role="radiogroup" aria-label="Theme selection">
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
          aria-label="Reload themes"
        >
          {loading ? "..." : "↻ Reload"}
        </button>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <div className="inline-error-actions">
            <button className="retry-button" onClick={() => reloadThemes()} disabled={loading}>Retry</button>
          </div>
        </div>
      )}

      {themeList.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={activeThemeId === t.id}
          className={`theme-card ${activeThemeId === t.id ? "active" : ""}`}
          onClick={() => activateTheme(t.id)}
          style={{ opacity: t.valid ? 1 : 0.7 }}
          aria-label={`${t.name}${!t.valid ? " (has warnings)" : ""}`}
        >
          <div
            className="theme-swatch"
            style={{ background: t.accent }}
            aria-hidden="true"
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

      {themeList.length === 0 && !loading && (
        <div style={{ padding: "var(--app-spacing-md)", color: "var(--app-text-muted)", textAlign: "center", fontSize: "var(--app-font-size-sm)" }} role="status">
          No themes found
        </div>
      )}
    </div>
  );
}

function SettingsSection() {
  const openWorkspacePicker = useUiStore((s) => s.openWorkspacePicker);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const [highContrast, setHighContrast] = React.useState(
    document.documentElement.classList.contains("high-contrast")
  );

  function toggleHighContrast() {
    const next = !highContrast;
    setHighContrast(next);
    document.documentElement.classList.toggle("high-contrast", next);
  }

  return (
    <div className="sidebar-stack">
      <button className="primary-button" onClick={openWorkspacePicker} aria-label="Select workspace">Select Workspace</button>
      <div className="sidebar-note">Workspace: {selectedWorkspace ?? "none selected"}</div>
      <div style={{ padding: "var(--app-spacing-sm) 0", borderTop: "1px solid var(--app-border-subtle)", marginTop: "var(--app-spacing-sm)" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--app-text-muted)", marginBottom: "var(--app-spacing-sm)" }}>
          Accessibility
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--app-spacing-sm)", cursor: "pointer", fontSize: "var(--app-font-size-sm)", color: "var(--app-text-secondary)" }}>
          <input
            type="checkbox"
            checked={highContrast}
            onChange={toggleHighContrast}
            aria-label="Toggle high contrast mode"
          />
          High Contrast Mode
        </label>
        <div className="field-help" style={{ marginTop: "var(--app-spacing-xs)" }}>
          Increases contrast for better readability. Meets WCAG AA guidelines.
        </div>
      </div>
      <RuntimeStatus />
    </div>
  );
}
