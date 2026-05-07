import { useAdapterStore } from "../../stores/adapterStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useProfileStore } from "../../stores/profileStore";
import { useThemeStore } from "../../stores/themeStore";
import { useUiStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { PreviewLauncher } from "../preview/PreviewLauncher";

export function TopBar() {
  const openNewRun = useUiStore((s) => s.openNewRun);
  const openPalette = useUiStore((s) => s.openCommandPalette);
  const openWorkspacePicker = useUiStore((s) => s.openWorkspacePicker);
  const toggleRightPanel = useLayoutStore((s) => s.toggleRightPanel);
  const toggleBottomPanel = useLayoutStore((s) => s.toggleBottomPanel);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const connected = useAdapterStore((s) => s.connected);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const activeBackend = useAdapterStore((s) => s.activeBackend);
  const hermesConnected = useAdapterStore((s) => s.hermesConnected);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const activeTheme = useThemeStore((s) => s.activeTheme);

  const backendLabel = backendMode === "auto" ? `auto/${activeBackend}` : backendMode;
  const runtimeTone = connected && (activeBackend === "hermes" || backendMode === "hermes") && hermesConnected
    ? "ok"
    : activeBackend === "mock" || backendMode === "mock"
      ? "warn"
      : connected
        ? "warn"
        : "danger";

  return (
    <header className="top-bar" role="banner">
      <div className="top-bar-left">
        <div className="app-mark">Hermes Desktop Studio</div>
        <button className="topbar-button primary" onClick={openNewRun} title="Ctrl+Shift+N" aria-label="Create new run">New Run</button>
        <button className="topbar-button" onClick={openWorkspacePicker} aria-label="Select workspace">
          <span className="topbar-label">Workspace</span>
          <span className="topbar-value">{selectedWorkspace ?? "Select folder"}</span>
        </button>
      </div>
      <div className="top-bar-center" aria-label="Runtime status">
        <span className={`runtime-chip ${runtimeTone}`} role="status">Backend {backendLabel}</span>
        <span className="runtime-chip">Profile {activeProfile?.name ?? "unknown"}</span>
        <span className="runtime-chip">Theme {activeTheme().meta.name}</span>
      </div>
      <div className="top-bar-right">
        <PreviewLauncher url="" label="Preview" title="New Preview" className="topbar-button" />
        <button className="icon-button" onClick={toggleSidebar} title="Toggle sidebar" aria-label="Toggle sidebar" data-tooltip="Toggle sidebar">S</button>
        <button className="icon-button" onClick={toggleBottomPanel} title="Toggle bottom panel" aria-label="Toggle bottom panel" data-tooltip="Toggle bottom">B</button>
        <button className="icon-button" onClick={toggleRightPanel} title="Toggle inspector" aria-label="Toggle right panel" data-tooltip="Toggle inspector">I</button>
        <button className="topbar-button" onClick={openPalette} aria-label="Open command palette">Command Palette Ctrl+K</button>
      </div>
    </header>
  );
}
