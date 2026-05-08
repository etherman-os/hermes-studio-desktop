import React from "react";
import { useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { useUiStore } from "../../stores/uiStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useApprovalStore } from "../../stores/approvalStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useProfileStore } from "../../stores/profileStore";
import { useLogStore } from "../../stores/logStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useNativeStore } from "../../stores/nativeStore";
import { useProcessStore } from "../../stores/processStore";
import { useToolPackStore } from "../../stores/toolPackStore";
import { useModelStore } from "../../stores/modelStore";
import { LeftRail } from "./LeftRail";
import { LeftSidebar } from "./LeftSidebar";
import { CenterArea } from "./CenterArea";
import { RightPanel } from "./RightPanel";
import { BottomPanel } from "./BottomPanel";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "../command-palette/CommandPalette";
import { NewRunModal } from "../runs/NewRunModal";
import { WorkspacePicker } from "../workspace/WorkspacePicker";
import { listen } from "@tauri-apps/api/event";

export function AppFrame() {
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const showRight = useLayoutStore((s) => s.showRightPanel);
  const showBottom = useLayoutStore((s) => s.showBottomPanel);
  const openPalette = useUiStore((s) => s.openCommandPalette);
  const openNewRun = useUiStore((s) => s.openNewRun);
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const { load: loadWorkspace } = useWorkspaceStore.getState();
    const { initTheme } = useThemeStore.getState();
    const { init: initNative } = useNativeStore.getState();
    const { checkConnection } = useAdapterStore.getState();

    loadWorkspace();
    initTheme();
    initNative();

    void checkConnection().then((ok) => {
      if (ok) {
        void useSessionStore.getState().loadFromAdapter();
        void useProfileStore.getState().loadProfiles();
        void useLogStore.getState().loadRecent();
        void useThemeStore.getState().loadThemes();
        void useRunLedgerStore.getState().loadRecentRuns();
        void useApprovalStore.getState().loadPendingApprovals();
        void useProcessStore.getState().loadProcesses();
        void useToolPackStore.getState().loadPacks();
        void useModelStore.getState().loadConfig();
      }
    });
  }, []);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPalette();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openPalette]);

  React.useEffect(() => {
    const unlistenNewRun = listen("global-shortcut:new-run", () => {
      openNewRun();
    });

    const unlistenToggle = listen("global-shortcut:toggle-visibility", async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const visible = await win.isVisible();
      if (visible) {
        await win.hide();
      } else {
        await win.show();
        await win.setFocus();
      }
    });

    return () => {
      void unlistenNewRun.then((fn) => fn());
      void unlistenToggle.then((fn) => fn());
    };
  }, [openNewRun]);

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className={`app-frame ${showBottom ? "bottom-open" : "bottom-collapsed"} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${showRight ? "" : "right-collapsed"}`}>
        <TopBar />
        <LeftRail />
        {!sidebarCollapsed && <LeftSidebar />}
        <CenterArea />
        {showRight && <RightPanel />}
        {showBottom && <BottomPanel />}
        <StatusBar />
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only" id="app-announcer" />
      <CommandPalette />
      <NewRunModal />
      <WorkspacePicker />
    </>
  );
}
