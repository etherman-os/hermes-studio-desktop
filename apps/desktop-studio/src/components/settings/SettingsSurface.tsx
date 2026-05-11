import React from "react";
import { useThemeStore, type ThemeMode } from "../../stores/themeStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useUiStore } from "../../stores/uiStore";

// Keyboard shortcut reference data
const KEYBOARD_SHORTCUTS = [
  { category: "Navigation", shortcuts: [
    { keys: ["Ctrl", "K"], description: "Open command palette" },
    { keys: ["Ctrl", "Shift", "M"], description: "Toggle mode panel" },
    { keys: ["Ctrl", "B"], description: "Toggle sidebar" },
    { keys: ["Ctrl", "J"], description: "Toggle bottom panel" },
    { keys: ["Ctrl", "."], description: "Open right panel" },
  ]},
  { category: "Runs", shortcuts: [
    { keys: ["Ctrl", "Enter"], description: "Send message / start run" },
    { keys: ["Ctrl", "N"], description: "New run" },
    { keys: ["Escape"], description: "Stop current run" },
  ]},
  { category: "Panels", shortcuts: [
    { keys: ["Ctrl", "1"], description: "Go to Mission" },
    { keys: ["Ctrl", "2"], description: "Go to Runs" },
    { keys: ["Ctrl", "3"], description: "Go to Chat" },
    { keys: ["Ctrl", "4"], description: "Go to Board" },
  ]},
];

const DEFAULT_MODE_OPTIONS = [
  { value: "create", label: "Create Mode" },
  { value: "code", label: "Code Mode" },
  { value: "automate", label: "Automate Mode" },
  { value: "manage", label: "Manage Mode" },
] as const;

export function SettingsSurface() {
  const themeMode = useThemeStore((s) => s.themeMode);
  const setThemeMode = useThemeStore((s) => s.setThemeMode);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const installedThemes = useThemeStore((s) => s.installedThemes);

  const connected = useAdapterStore((s) => s.connected);
  const activeBackend = useAdapterStore((s) => s.activeBackend);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const hermesConnected = useAdapterStore((s) => s.hermesConnected);
  const hermesUrl = useAdapterStore((s) => s.hermesUrl);
  const storageAvailable = useAdapterStore((s) => s.storageAvailable);

  const activeMode = useLayoutStore((s) => s.activeMode);
  const setActiveMode = useLayoutStore((s) => s.setActiveMode);
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const showRightPanel = useLayoutStore((s) => s.showRightPanel);
  const showBottomPanel = useLayoutStore((s) => s.showBottomPanel);

  const openCommandPalette = useUiStore((s) => s.openCommandPalette);

  // Notification toggles (stored in component state for now)
  const [notifications, setNotifications] = React.useState({
    approvals: true,
    runComplete: true,
    delegationUpdate: false,
    systemAlerts: true,
  });

  // Font size preference
  const [fontSize, setFontSize] = React.useState(14);
  const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 18];

  const [activeSection, setActiveSection] = React.useState<string>("appearance");
  const SECTIONS = [
    { id: "appearance", label: "Appearance" },
    { id: "keyboard", label: "Keyboard Shortcuts" },
    { id: "notifications", label: "Notifications" },
    { id: "adapter", label: "Adapter" },
    { id: "studio", label: "Studio" },
  ];

  function handleThemeModeChange(mode: ThemeMode) {
    setThemeMode(mode);
  }

  function toggleNotification(key: keyof typeof notifications) {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const mockActive = backendMode === "mock" || activeBackend === "mock";

  return (
    <div className="settings-surface" data-testid="surface-settings">
      <div className="settings-header">
        <div>
          <div className="workbench-eyebrow">MANAGE mode</div>
          <h2>Settings</h2>
        </div>
      </div>

      <div className="settings-layout">
        {/* Section navigation sidebar */}
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              className={`settings-nav-item ${activeSection === section.id ? "active" : ""}`}
              onClick={() => setActiveSection(section.id)}
              aria-current={activeSection === section.id ? "page" : undefined}
            >
              {section.label}
            </button>
          ))}
        </nav>

        {/* Settings content */}
        <div className="settings-content">

          {/* Appearance */}
          {activeSection === "appearance" && (
            <section className="settings-section">
              <h3>Appearance</h3>

              <div className="settings-group">
                <label className="settings-label">Theme Mode</label>
                <div className="theme-mode-selector" role="radiogroup" aria-label="Theme mode">
                  {(["system", "light", "dark"] as ThemeMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={`theme-mode-option ${themeMode === mode ? "active" : ""}`}
                      onClick={() => handleThemeModeChange(mode)}
                      role="radio"
                      aria-checked={themeMode === mode}
                    >
                      <span className="theme-mode-icon">
                        {mode === "system" ? "S" : mode === "light" ? "L" : "D"}
                      </span>
                      <span className="theme-mode-label">{mode}</span>
                    </button>
                  ))}
                </div>
                <p className="settings-hint">
                  System follows your OS dark/light preference.
                </p>
              </div>

              <div className="settings-group">
                <label className="settings-label" htmlFor="theme-select">
                  Color Theme
                </label>
                <select
                  id="theme-select"
                  className="studio-select"
                  value={activeThemeId}
                  onChange={(e) => useThemeStore.getState().activateTheme(e.target.value)}
                >
                  {installedThemes().map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name ?? theme.id}
                    </option>
                  ))}
                </select>
                <p className="settings-hint">
                  Installed themes from the adapter. Restart may be required.
                </p>
              </div>

              <div className="settings-group">
                <label className="settings-label" htmlFor="font-size-select">
                  Font Size
                </label>
                <select
                  id="font-size-select"
                  className="studio-select"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                >
                  {FONT_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  ))}
                </select>
                <p className="settings-hint">
                  Adjust the base font size for the Studio interface.
                </p>
                <div
                  className="font-size-preview"
                  style={{ fontSize: `${fontSize}px` }}
                  aria-hidden="true"
                >
                  The quick brown fox jumps over the lazy dog.
                </div>
              </div>
            </section>
          )}

          {/* Keyboard Shortcuts */}
          {activeSection === "keyboard" && (
            <section className="settings-section">
              <h3>Keyboard Shortcuts</h3>
              <p className="settings-description">
                Keyboard shortcuts for quick navigation and actions in Hermes Studio.
              </p>

              {KEYBOARD_SHORTCUTS.map((group) => (
                <div key={group.category} className="shortcut-group">
                  <h4 className="shortcut-category">{group.category}</h4>
                  <div className="shortcut-list">
                    {group.shortcuts.map((shortcut) => (
                      <div key={shortcut.description} className="shortcut-row">
                        <span className="shortcut-keys">
                          {shortcut.keys.map((key, i) => (
                            <React.Fragment key={key}>
                              <kbd className="shortcut-key">{key}</kbd>
                              {i < shortcut.keys.length - 1 && <span className="shortcut-sep">+</span>}
                            </React.Fragment>
                          ))}
                        </span>
                        <span className="shortcut-desc">{shortcut.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="settings-group" style={{ marginTop: "var(--app-spacing-lg)" }}>
                <button
                  className="tool-button"
                  onClick={openCommandPalette}
                  aria-label="Open command palette"
                >
                  Open Command Palette (Ctrl+K)
                </button>
              </div>
            </section>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <section className="settings-section">
              <h3>Notifications</h3>
              <p className="settings-description">
                Choose which events trigger notifications in Studio.
              </p>

              <div className="settings-group">
                <div className="notification-toggle-row">
                  <div className="notification-toggle-info">
                    <strong>Approval Requests</strong>
                    <span>Notify when an approval requires your decision</span>
                  </div>
                  <label className="toggle-switch" aria-label="Toggle approval notifications">
                    <input
                      type="checkbox"
                      checked={notifications.approvals}
                      onChange={() => toggleNotification("approvals")}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="notification-toggle-row">
                  <div className="notification-toggle-info">
                    <strong>Run Completion</strong>
                    <span>Notify when a run finishes or encounters an error</span>
                  </div>
                  <label className="toggle-switch" aria-label="Toggle run completion notifications">
                    <input
                      type="checkbox"
                      checked={notifications.runComplete}
                      onChange={() => toggleNotification("runComplete")}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="notification-toggle-row">
                  <div className="notification-toggle-info">
                    <strong>Delegation Updates</strong>
                    <span>Notify on delegation status changes and completions</span>
                  </div>
                  <label className="toggle-switch" aria-label="Toggle delegation notifications">
                    <input
                      type="checkbox"
                      checked={notifications.delegationUpdate}
                      onChange={() => toggleNotification("delegationUpdate")}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="notification-toggle-row">
                  <div className="notification-toggle-info">
                    <strong>System Alerts</strong>
                    <span>Notify on adapter connection changes and Hermes status</span>
                  </div>
                  <label className="toggle-switch" aria-label="Toggle system alerts">
                    <input
                      type="checkbox"
                      checked={notifications.systemAlerts}
                      onChange={() => toggleNotification("systemAlerts")}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </section>
          )}

          {/* Adapter Settings */}
          {activeSection === "adapter" && (
            <section className="settings-section">
              <h3>Hermes Agent Adapter</h3>
              <p className="settings-description">
                Connection settings for the Hermes Agent adapter server.
              </p>

              <div className="settings-group">
                <label className="settings-label">Connection Status</label>
                <div className="adapter-status-display">
                  <div className="adapter-status-row">
                    <span className={`status-dot status-${connected ? "ok" : "danger"}`} />
                    <span>Adapter {connected ? "Connected" : "Disconnected"}</span>
                  </div>
                  <div className="adapter-status-row">
                    <span className={`status-dot status-${hermesConnected ? "ok" : "neutral"}`} />
                    <span>Hermes {hermesConnected ? "Reachable" : "Unreachable"}</span>
                  </div>
                  {hermesUrl && hermesUrl !== "unknown" && (
                    <div className="adapter-status-row">
                      <code className="adapter-url">{hermesUrl}</code>
                    </div>
                  )}
                </div>
              </div>

              <div className="settings-group">
                <label className="settings-label">Active Backend</label>
                <div className="adapter-backend-display">
                  <span className={`backend-chip ${mockActive ? "warn" : "ok"}`}>
                    {mockActive ? "Studio simulation" : activeBackend || "unknown"}
                  </span>
                  <span className="backend-mode-label">
                    Mode: {backendMode}
                  </span>
                </div>
                <p className="settings-hint">
                  {mockActive
                    ? "Running in simulation mode. Start the adapter for real Hermes connections."
                    : "Connected to a live Hermes Agent backend."}
                </p>
              </div>

              <div className="settings-group">
                <label className="settings-label">Storage</label>
                <div className="storage-status-display">
                  <div className="storage-status-row">
                    <span className={`status-dot status-${storageAvailable ? "ok" : "warn"}`} />
                    <span>{storageAvailable ? "Available" : "Unavailable"}</span>
                  </div>
                  {storageAvailable && (
                    <p className="settings-hint">
                      Local storage is ready for runs, sessions, and artifacts.
                    </p>
                  )}
                </div>
              </div>

              <div className="settings-group">
                <label className="settings-label">Adapter Endpoint</label>
                <div className="adapter-endpoint-display">
                  <code>http://127.0.0.1:39191</code>
                  <span className="adapter-port-note">Studio adapter port</span>
                </div>
              </div>
            </section>
          )}

          {/* Studio Settings */}
          {activeSection === "studio" && (
            <section className="settings-section">
              <h3>Studio Preferences</h3>

              <div className="settings-group">
                <label className="settings-label" htmlFor="default-mode-select">
                  Default Mode
                </label>
                <select
                  id="default-mode-select"
                  className="studio-select"
                  value={activeMode}
                  onChange={(e) => setActiveMode(e.target.value as typeof activeMode)}
                >
                  {DEFAULT_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="settings-hint">
                  The mode Studio opens to on startup.
                </p>
              </div>

              <div className="settings-group">
                <label className="settings-label">Sidebar Behavior</label>
                <div className="sidebar-behavior-options">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={sidebarCollapsed}
                      onChange={() => useLayoutStore.getState().toggleSidebar()}
                    />
                    Collapse sidebar by default
                  </label>
                  <p className="settings-hint">
                    When enabled, the left sidebar starts collapsed on load.
                  </p>
                </div>
              </div>

              <div className="settings-group">
                <label className="settings-label">Bottom Panel</label>
                <div className="sidebar-behavior-options">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={showBottomPanel}
                      onChange={() => useLayoutStore.getState().toggleBottomPanel()}
                    />
                    Show bottom panel on startup
                  </label>
                </div>
              </div>

              <div className="settings-group">
                <label className="settings-label">Right Panel</label>
                <div className="sidebar-behavior-options">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={showRightPanel}
                      onChange={() => useLayoutStore.getState().toggleRightPanel()}
                    />
                    Show right panel on startup
                  </label>
                </div>
              </div>

              <div className="settings-group">
                <label className="settings-label">Panel Sizes</label>
                <div className="panel-size-controls">
                  <button
                    className="tool-button"
                    onClick={() => useLayoutStore.getState().resetPanelSizes()}
                    aria-label="Reset all panel sizes to default"
                  >
                    Reset Panel Sizes
                  </button>
                  <p className="settings-hint">
                    Resets sidebar, right panel, and bottom panel to default dimensions.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}