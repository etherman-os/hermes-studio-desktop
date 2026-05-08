import { useAdapterStore } from "../../stores/adapterStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useProfileStore } from "../../stores/profileStore";
import { useUiStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

export function TopBar() {
  const openNewRun = useUiStore((s) => s.openNewRun);
  const openPalette = useUiStore((s) => s.openCommandPalette);
  const openWorkspacePicker = useUiStore((s) => s.openWorkspacePicker);
  const toggleRightPanel = useLayoutStore((s) => s.toggleRightPanel);
  const toggleBottomPanel = useLayoutStore((s) => s.toggleBottomPanel);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const connected = useAdapterStore((s) => s.connected);
  const activeProfile = useProfileStore((s) => s.activeProfile);

  return (
    <header className="top-bar" role="banner">
      <div className="top-bar-left">
        <div className="app-mark">Hermes Studio</div>
        <button className="topbar-button primary" onClick={openNewRun} title="Ctrl+Shift+N" aria-label="Create new run">+ New Run</button>
      </div>
      <div className="top-bar-right">
        <button className="topbar-button workspace-button" onClick={openWorkspacePicker} aria-label="Select workspace">
          <span className="topbar-value">{selectedWorkspace ?? "Select workspace"}</span>
        </button>
        <span className={`runtime-chip ${connected ? "ok" : "danger"}`} role="status">
          {activeProfile?.name ?? "No profile"}
        </span>
        <button className="icon-button" onClick={toggleSidebar} title="Toggle sidebar" aria-label="Toggle sidebar">☰</button>
        <button className="icon-button" onClick={toggleBottomPanel} title="Toggle bottom panel" aria-label="Toggle bottom panel">▤</button>
        <button className="icon-button" onClick={toggleRightPanel} title="Toggle inspector" aria-label="Toggle right panel">◫</button>
        <button className="topbar-button" onClick={openPalette} aria-label="Open command palette" title="Ctrl+K">⌘K</button>
      </div>
    </header>
  );
}
