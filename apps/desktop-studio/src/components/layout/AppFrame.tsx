import React from "react";
import { useLayoutStore, MODE_HOME_SURFACE } from "../../stores/layoutStore";
import { parseStudioUrl, pushStudioUrl, syncUrlFromStore } from "../../utils/studioRouter";
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
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
import { ActivityRail4 } from "./ActivityRail4";
import { LeftSidebar } from "./LeftSidebar";
import { CenterArea } from "./CenterArea";
import { RightPanel } from "./RightPanel";
import { BottomPanel } from "./BottomPanel";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "../command-palette/CommandPalette";
import { NewRunModal } from "../runs/NewRunModal";
import { ThemeWorld } from "../theme/ThemeWorld";
import { WorkspacePicker } from "../workspace/WorkspacePicker";
import { listen } from "@tauri-apps/api/event";
import { ToastContainer } from "../common/Toast";
import type { Mode, CenterTab } from "../../stores/layoutStore";
import { useToastStore } from "../../stores/toastStore";

export function AppFrame() {
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const showRight = useLayoutStore((s) => s.showRightPanel);
  const showBottom = useLayoutStore((s) => s.showBottomPanel);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const rightPanelWidth = useLayoutStore((s) => s.rightPanelWidth);
  const bottomPanelHeight = useLayoutStore((s) => s.bottomPanelHeight);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setRightPanelWidth = useLayoutStore((s) => s.setRightPanelWidth);
  const setBottomPanelHeight = useLayoutStore((s) => s.setBottomPanelHeight);
  const openPalette = useUiStore((s) => s.openCommandPalette);
  const openNewRun = useUiStore((s) => s.openNewRun);
  const initialized = React.useRef(false);
  const resizeMode = React.useRef<"sidebar" | "right" | "bottom" | null>(null);
  // Store Tauri unlisten functions in refs to ensure proper cleanup
  const unlistenRefs = React.useRef<Array<() => void | Promise<void>>>([]);

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
    void useHermesInventoryStore.getState().loadInventory();

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
        void useHermesInventoryStore.getState().loadInventory();
        void useModelStore.getState().loadConfig();
      }
    });
  }, []);

  // Store values for URL sync
  const setActiveMode = useLayoutStore((s) => s.setActiveMode);
  const activeMode = useLayoutStore((s) => s.activeMode);
  const activeTab = useLayoutStore((s) => s.activeTab);

  // URL routing: sync store -> URL on startup
  React.useEffect(() => {
    syncUrlFromStore(activeMode, activeTab);
  }, [activeMode, activeTab]);

  // Listen for browser back/forward navigation (popstate)
  React.useEffect(() => {
    function handlePopState(_event: PopStateEvent) {
      const route = parseStudioUrl(window.location.pathname);
      const { setActiveMode: sam, setActiveTab: sat } = useLayoutStore.getState();
      sam(route.mode);
      // Brief delay so setActiveMode can update activeTab first
      setTimeout(() => sat(route.surface), 0);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl+K: Open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      // Cmd/Ctrl+1-4: Switch mode
      if ((e.metaKey || e.ctrlKey) && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        const modes: Array<"create" | "code" | "automate" | "manage"> = ["create", "code", "automate", "manage"];
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < modes.length) {
          setActiveMode(modes[idx]);
        }
        return;
      }
      // Escape: Close any open modal
      if (e.key === "Escape") {
        const { closeCommandPalette } = useUiStore.getState();
        closeCommandPalette();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openPalette, setActiveMode]);

  // Update URL when mode/tab changes (browser history push)
  React.useEffect(() => {
    pushStudioUrl(activeMode, activeTab);
  }, [activeMode, activeTab]);

  React.useEffect(() => {
    document.documentElement.dataset.mode = activeMode;
  }, [activeMode]);

  React.useEffect(() => {
    // Set up Tauri event listeners and store cleanup functions
    const unlistenNewRunPromise = listen("global-shortcut:new-run", () => {
      openNewRun();
    });

    const unlistenDeepLinkPromise = listen<{ mode: Mode; surface: CenterTab }>("deep-link:navigate", (event) => {
      const { mode, surface } = event.payload;
      useLayoutStore.getState().navigateTo({ mode, surface });
      useToastStore.getState().addToast({
        kind: "info",
        title: "Navigated",
        message: `Opened ${surface} in ${mode} mode`,
        duration: 2500,
      });
    });

    const unlistenTogglePromise = listen("global-shortcut:toggle-visibility", async () => {
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

    // Store cleanup functions that work properly with async listeners
    unlistenRefs.current = [
      () => { unlistenNewRunPromise.then((fn) => fn()); },
      () => { unlistenDeepLinkPromise.then((fn) => fn()); },
      () => { unlistenTogglePromise.then((fn) => fn()); },
    ];

    return () => {
      // Properly await and call each unlisten function
      for (const unlisten of unlistenRefs.current) {
        try {
          const result = unlisten();
          if (result instanceof Promise) {
            result.catch((err) => console.warn("unlisten error:", err));
          }
        } catch (err) {
          console.warn("unlisten error:", err);
        }
      }
      unlistenRefs.current = [];
    };
  }, [openNewRun]);

  React.useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!resizeMode.current) return;
      event.preventDefault();
      if (resizeMode.current === "sidebar") {
        setSidebarWidth(event.clientX - 48);
      } else if (resizeMode.current === "right") {
        setRightPanelWidth(window.innerWidth - event.clientX);
      } else if (resizeMode.current === "bottom") {
        setBottomPanelHeight(window.innerHeight - 24 - event.clientY);
      }
    }

    function handlePointerUp() {
      resizeMode.current = null;
      document.body.classList.remove("is-resizing");
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [setBottomPanelHeight, setRightPanelWidth, setSidebarWidth]);

  function beginResize(mode: "sidebar" | "right" | "bottom") {
    resizeMode.current = mode;
    document.body.classList.add("is-resizing");
  }

  const frameStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--right-panel-width": `${rightPanelWidth}px`,
    "--bottom-panel-height": `${bottomPanelHeight}px`,
  } as React.CSSProperties;

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div
        className={`app-frame ${showBottom ? "bottom-open" : "bottom-collapsed"} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${showRight ? "" : "right-collapsed"}`}
        style={frameStyle}
        data-mode={activeMode}
      >
        <TopBar />
        <ActivityRail4 />
        {!sidebarCollapsed && <LeftSidebar />}
        <CenterArea />
        {showRight && <RightPanel />}
        {showBottom && <BottomPanel />}
        <ThemeWorld />
        {!sidebarCollapsed && (
          <div
            className="resize-handle resize-handle-sidebar"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onPointerDown={() => beginResize("sidebar")}
          />
        )}
        {showRight && (
          <div
            className="resize-handle resize-handle-right"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize inspector"
            onPointerDown={() => beginResize("right")}
          />
        )}
        {showBottom && (
          <div
            className="resize-handle resize-handle-bottom"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize bottom panel"
            onPointerDown={() => beginResize("bottom")}
          />
        )}
        <StatusBar />
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only" id="app-announcer" />
      <CommandPalette />
      <NewRunModal />
      <WorkspacePicker />
      <ToastContainer />
    </>
  );
}
