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
  const checkConnection = useAdapterStore((s) => s.checkConnection);
  const loadSessions = useSessionStore((s) => s.loadFromAdapter);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);
  const loadLogs = useLogStore((s) => s.loadRecent);
  const loadRecentRuns = useRunLedgerStore((s) => s.loadRecentRuns);
  const loadPendingApprovals = useApprovalStore((s) => s.loadPendingApprovals);
  const initTheme = useThemeStore((s) => s.initTheme);
  const loadThemes = useThemeStore((s) => s.loadThemes);
  const loadWorkspace = useWorkspaceStore((s) => s.load);
  const initNative = useNativeStore((s) => s.init);
  const loadProcesses = useProcessStore((s) => s.loadProcesses);
  const loadToolPacks = useToolPackStore((s) => s.loadPacks);

  React.useEffect(() => {
    loadWorkspace();
    initTheme();
    initNative();
    checkConnection().then((ok) => {
      if (ok) {
        loadSessions();
        loadProfiles();
        loadLogs();
        loadThemes();
        loadRecentRuns();
        loadPendingApprovals();
        loadProcesses();
        loadToolPacks();
      }
    });
  }, [loadWorkspace, initTheme, initNative, checkConnection, loadSessions, loadProfiles, loadLogs, loadThemes, loadRecentRuns, loadPendingApprovals, loadProcesses, loadToolPacks]);

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
