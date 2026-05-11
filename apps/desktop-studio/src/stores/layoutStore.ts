import { create } from "zustand";

export const CENTER_TABS = [
  "mission",
  "runs",
  "chat",
  "board",
  "sessions",
  "design",
  "artifacts",
  "processes",
  "checkpoints",
  "worktrees",
  "context",
  "approvals",
  "extensions",
  "delegations",
  "cron",
  "profiles",
  "settings",
] as const;

export const SIDEBAR_SECTIONS = [
  ...CENTER_TABS,
  "more",
  "logs",
  "profiles",
  "theme_gallery",
  "settings",
] as const;

export const BOTTOM_TABS = ["activity", "logs", "diagnostics"] as const;

export type CenterTab = (typeof CENTER_TABS)[number];
export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];
export type BottomTab = (typeof BOTTOM_TABS)[number];

// --- Mode support (Phase 0: Preparation) ---

export type Mode = "create" | "code" | "automate" | "manage";

export const MODE_HOME_SURFACE: Record<Mode, CenterTab> = {
  create: "mission",
  code: "runs",
  automate: "extensions",
  manage: "sessions",
} as const;

export const MODE_SURFACES: Record<Mode, readonly CenterTab[]> = {
  create: ["mission", "design", "artifacts", "board", "chat"] as const,
  code: ["runs", "processes", "checkpoints", "worktrees", "delegations"] as const,
  automate: ["extensions", "delegations", "cron", "context"] as const,
  manage: ["sessions", "approvals", "profiles", "settings"] as const,
} as const;

/**
 * Find which mode a given tab belongs to.
 * Returns null if the tab is not assigned to any mode (during migration).
 */
export function findModeForTab(tab: CenterTab): Mode | null {
  for (const [mode, surfaces] of Object.entries(MODE_SURFACES)) {
    if ((surfaces as readonly CenterTab[]).includes(tab)) {
      return mode as Mode;
    }
  }
  return null;
}

export function isValidSurfaceForMode(mode: Mode, tab: CenterTab): boolean {
  return (MODE_SURFACES[mode] as readonly CenterTab[]).includes(tab);
}

// --- Validation helpers ---

function isCenterTab(tab: string): tab is CenterTab {
  return CENTER_TABS.includes(tab as CenterTab);
}

function isSidebarSection(section: string): section is SidebarSection {
  return SIDEBAR_SECTIONS.includes(section as SidebarSection);
}

function normalizeBottomTab(tab: string): BottomTab {
  return tab === "adapter_diagnostics" ? "diagnostics" : BOTTOM_TABS.includes(tab as BottomTab) ? tab as BottomTab : "activity";
}

const LAYOUT_SIZE_KEY = "hermes-studio-layout-sizes";
const LAYOUT_PREFS_KEY = "hermes-studio-layout-prefs";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readSizes() {
  try {
    const raw = localStorage.getItem(LAYOUT_SIZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      sidebarWidth: typeof parsed.sidebarWidth === "number" ? clamp(parsed.sidebarWidth, 220, 420) : undefined,
      rightPanelWidth: typeof parsed.rightPanelWidth === "number" ? clamp(parsed.rightPanelWidth, 280, 560) : undefined,
      bottomPanelHeight: typeof parsed.bottomPanelHeight === "number" ? clamp(parsed.bottomPanelHeight, 150, 420) : undefined,
    };
  } catch {
    return {};
  }
}

function persistSizes(state: Pick<LayoutState, "sidebarWidth" | "rightPanelWidth" | "bottomPanelHeight">) {
  try {
    localStorage.setItem(LAYOUT_SIZE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable
  }
}

interface LayoutPrefs {
  activeMode: Mode;
  activeTab: CenterTab;
}

function readPrefs(): Partial<LayoutPrefs> {
  try {
    const raw = localStorage.getItem(LAYOUT_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<LayoutPrefs>;
  } catch {
    return {};
  }
}

function persistPrefs(state: Pick<LayoutState, "activeMode" | "activeTab">) {
  try {
    localStorage.setItem(LAYOUT_PREFS_KEY, JSON.stringify({ activeMode: state.activeMode, activeTab: state.activeTab }));
  } catch {
    // localStorage unavailable
  }
}

interface LayoutState {
  activeTab: CenterTab;
  activeMode: Mode;
  isModePanelVisible: boolean;
  sidebarCollapsed: boolean;
  showRightPanel: boolean;
  showBottomPanel: boolean;
  sidebarSection: SidebarSection;
  bottomTab: BottomTab;
  sidebarWidth: number;
  rightPanelWidth: number;
  bottomPanelHeight: number;
  setActiveTab: (tab: CenterTab | string) => void;
  setActiveMode: (mode: Mode) => void;
  navigateTo: (target: { mode: Mode; surface: CenterTab }) => void;
  showModePanel: () => void;
  hideModePanel: () => void;
  showSidebar: () => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  openRightPanel: () => void;
  openBottomPanel: () => void;
  setSidebarSection: (section: SidebarSection | string) => void;
  setBottomTab: (tab: BottomTab | "adapter_diagnostics" | string) => void;
  setSidebarWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;
  resetPanelSizes: () => void;
}

const initialSizes = readSizes();
const initialPrefs = readPrefs();

export const useLayoutStore = create<LayoutState>((set, get) => ({
  activeTab: initialPrefs.activeTab ?? "mission",
  activeMode: initialPrefs.activeMode ?? "create",
  isModePanelVisible: false,
  sidebarCollapsed: false,
  showRightPanel: false,
  showBottomPanel: false,
  sidebarSection: "mission",
  bottomTab: "activity",
  sidebarWidth: initialSizes.sidebarWidth ?? 284,
  rightPanelWidth: initialSizes.rightPanelWidth ?? 360,
  bottomPanelHeight: initialSizes.bottomPanelHeight ?? 240,

  setActiveTab: (tab) => {
    if (!isCenterTab(tab)) return;
    const mode = findModeForTab(tab as CenterTab);
    if (mode) {
      set({ activeTab: tab as CenterTab, activeMode: mode });
    } else {
      set({ activeTab: tab as CenterTab });
    }
    const s = get();
    persistPrefs({ activeMode: s.activeMode, activeTab: s.activeTab });
  },

  setActiveMode: (mode) => {
    const home = MODE_HOME_SURFACE[mode];
    set({ activeMode: mode, activeTab: home });
    persistPrefs({ activeMode: mode, activeTab: home });
  },

  navigateTo: (target) => {
    set({ activeMode: target.mode, activeTab: target.surface });
    persistPrefs({ activeMode: target.mode, activeTab: target.surface });
  },

  showModePanel: () => set({ isModePanelVisible: true }),
  hideModePanel: () => set({ isModePanelVisible: false }),

  showSidebar: () => set({ sidebarCollapsed: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleRightPanel: () => set((s) => ({ showRightPanel: !s.showRightPanel })),
  toggleBottomPanel: () => set((s) => ({ showBottomPanel: !s.showBottomPanel })),
  openRightPanel: () => set({ showRightPanel: true }),
  openBottomPanel: () => set({ showBottomPanel: true }),
  setSidebarSection: (section) => set((s) => ({ sidebarSection: isSidebarSection(section) ? section : s.sidebarSection })),
  setBottomTab: (tab) => set({ bottomTab: normalizeBottomTab(tab) }),
  setSidebarWidth: (width) => {
    const sidebarWidth = clamp(width, 220, 420);
    set({ sidebarWidth });
    persistSizes({ sidebarWidth, rightPanelWidth: get().rightPanelWidth, bottomPanelHeight: get().bottomPanelHeight });
  },
  setRightPanelWidth: (width) => {
    const rightPanelWidth = clamp(width, 280, 560);
    set({ rightPanelWidth });
    persistSizes({ sidebarWidth: get().sidebarWidth, rightPanelWidth, bottomPanelHeight: get().bottomPanelHeight });
  },
  setBottomPanelHeight: (height) => {
    const bottomPanelHeight = clamp(height, 150, 420);
    set({ bottomPanelHeight });
    persistSizes({ sidebarWidth: get().sidebarWidth, rightPanelWidth: get().rightPanelWidth, bottomPanelHeight });
  },
  resetPanelSizes: () => {
    const sizes = { sidebarWidth: 284, rightPanelWidth: 360, bottomPanelHeight: 240 };
    set(sizes);
    persistSizes(sizes);
  },
}));
