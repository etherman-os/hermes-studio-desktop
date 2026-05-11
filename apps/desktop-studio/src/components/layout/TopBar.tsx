import { Command, FolderOpen, PanelBottom, PanelLeft, PanelRight, Plus, Sparkles } from "lucide-react";
import { useAdapterStore } from "../../stores/adapterStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useProfileStore } from "../../stores/profileStore";
import { useUiStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { STUDIO_BASE } from "../../utils/studioRouter";

type Mode = "create" | "code" | "automate" | "manage";

const MODE_LABELS: Record<Mode, string> = {
  create: "CREATE",
  code: "CODE",
  automate: "AUTOMATE",
  manage: "MANAGE",
};

const MODE_STYLES: Record<Mode, { bg: string; text: string; border: string }> = {
  create: { bg: "var(--accent-create-bg, #7c3aed22)", text: "var(--accent-create-text, #a855f7)", border: "var(--accent-create-border, #7c3aed55)" },
  code: { bg: "var(--accent-code-bg, #0ea5e922)", text: "var(--accent-code-text, #0ea5e9)", border: "var(--accent-code-border, #0ea5e955)" },
  automate: { bg: "var(--accent-automate-bg, #22c55e22)", text: "var(--accent-automate-text, #22c55e)", border: "var(--accent-automate-border, #22c55e55)" },
  manage: { bg: "var(--accent-manage-bg, #f59e0b22)", text: "var(--accent-manage-text, #f59e0b)", border: "var(--accent-manage-border, #f59e0b55)" },
};

export function TopBar() {
  const openNewRun = useUiStore((s) => s.openNewRun);
  const openPalette = useUiStore((s) => s.openCommandPalette);
  const openWorkspacePicker = useUiStore((s) => s.openWorkspacePicker);
  const toggleRightPanel = useLayoutStore((s) => s.toggleRightPanel);
  const toggleBottomPanel = useLayoutStore((s) => s.toggleBottomPanel);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const connected = useAdapterStore((s) => s.connected);
  const activeMode = useLayoutStore((s) => s.activeMode);
  const activeTab = useLayoutStore((s) => s.activeTab);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const skills = useHermesInventoryStore((s) => s.skills);
  const skillCount = skills.length;
  const activeStyle = MODE_STYLES[activeMode as Mode];

  // Build breadcrumb path from current mode + tab
  const breadcrumb = activeTab
    ? `${STUDIO_BASE}/${activeMode}/${activeTab}`
    : `${STUDIO_BASE}/${activeMode}`;

  return (
    <header className="top-bar" role="banner">
      <div className="top-bar-left">
        <div className="app-mark">Hermes Studio</div>
        <span className="breadcrumb" aria-label="Current path">{breadcrumb}</span>
        <button
          className="mode-badge"
          style={{ background: activeStyle.bg, color: activeStyle.text, borderColor: activeStyle.border }}
          onClick={() => {
            const modes: Mode[] = ["create", "code", "automate", "manage"];
            const idx = modes.indexOf(activeMode as Mode);
            useLayoutStore.getState().setActiveMode(modes[(idx + 1) % modes.length] as Mode);
          }}
          title={`Ctrl+1 CREATE | Ctrl+2 CODE | Ctrl+3 AUTOMATE | Ctrl+4 MANAGE`}
          aria-label={`Current mode: ${MODE_LABELS[activeMode as Mode]}. Click to cycle modes. Shortcuts: Ctrl+1-4 to switch modes.`}
        >
          {MODE_LABELS[activeMode as Mode]}
        </button>
        <button className="topbar-button primary" onClick={() => openNewRun()} title="Ctrl+Shift+N" aria-label="Create new run">
          <Plus size={14} aria-hidden="true" />
          <span>New Run</span>
        </button>
      </div>
      <div className="top-bar-right">
        {skillCount > 0 && (
          <span className="arsenal-chip" title={`${skillCount} skills available`}>
            <Sparkles size={12} aria-hidden="true" />
            <span>{skillCount} skills active</span>
          </span>
        )}
        <button className="topbar-button workspace-button" onClick={openWorkspacePicker} aria-label="Select workspace">
          <FolderOpen size={14} aria-hidden="true" />
          <span className="topbar-value">{selectedWorkspace ?? "Select workspace"}</span>
        </button>
        <span className={`runtime-chip ${connected ? "ok" : "danger"}`} role="status" title="Active profile and mode">
          {activeProfile?.name ?? "No profile"}
          <span style={{ opacity: 0.6, marginLeft: 4 }}>|</span>
          <span style={{ marginLeft: 4, color: activeStyle.text }}>{MODE_LABELS[activeMode as Mode]}</span>
        </span>
        <button className="icon-button" onClick={toggleSidebar} title="Toggle sidebar" aria-label="Toggle sidebar">
          <PanelLeft size={15} aria-hidden="true" />
        </button>
        <button className="icon-button" onClick={toggleBottomPanel} title="Toggle bottom panel" aria-label="Toggle bottom panel">
          <PanelBottom size={15} aria-hidden="true" />
        </button>
        <button className="icon-button" onClick={toggleRightPanel} title="Toggle inspector" aria-label="Toggle right panel">
          <PanelRight size={15} aria-hidden="true" />
        </button>
        <button className="topbar-button" onClick={openPalette} aria-label="Open command palette" title="Ctrl+K">
          <Command size={14} aria-hidden="true" />
          <span>Ctrl K</span>
        </button>
      </div>
    </header>
  );
}
