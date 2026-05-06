import { useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useProfileStore } from "../../stores/profileStore";

export function LeftSidebar() {
  const section = useLayoutStore((s) => s.sidebarSection);
  const label = useThemeStore((s) => s.label);
  const icon = useThemeStore((s) => s.icon);

  return (
    <div className="sidebar">
      <div className="sidebar-header">{label(section)}</div>
      <div className="sidebar-content">
        {section === "sessions" && <SessionsList />}
        {section === "profiles" && <ProfilesList />}
        {section === "search" && <SearchSection />}
        {section === "theme_gallery" && <ThemeGallerySection />}
        {section === "settings" && <SettingsSection />}
        {!["sessions", "profiles", "search", "theme_gallery", "settings"].includes(section) && (
          <div className="empty-state">
            <div className="empty-state-icon">{icon(section)}</div>
            <div className="empty-state-text">{label(section)}</div>
          </div>
        )}
      </div>
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
  const { ALL_THEMES, activeThemeId, setTheme } = useThemeStoreForGallery();

  return (
    <div className="theme-switcher-panel">
      {Object.values(ALL_THEMES).map((t) => (
        <button
          key={t.meta.id}
          className={`theme-card ${activeThemeId === t.meta.id ? "active" : ""}`}
          onClick={() => setTheme(t.meta.id)}
        >
          <div
            className="theme-swatch"
            style={{ background: t.palette?.accent ?? "#58a6ff" }}
          />
          <div className="theme-card-info">
            <div className="theme-card-name">{t.meta.name}</div>
            <div className="theme-card-desc">{t.meta.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function useThemeStoreForGallery() {
  const ALL_THEMES = useThemeStore((s) => s.themes);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const setTheme = useThemeStore((s) => s.setTheme);
  return { ALL_THEMES, activeThemeId, setTheme };
}

function SettingsSection() {
  const label = useThemeStore((s) => s.label);
  return (
    <div style={{ padding: "var(--app-spacing-sm)", color: "var(--app-text-muted)" }}>
      <p>{label("settings")} — placeholder</p>
    </div>
  );
}
