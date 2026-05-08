import { create } from "zustand";

export const CENTER_TABS = [
  "runs",
  "chat",
  "board",
  "sessions",
  "artifacts",
  "processes",
  "checkpoints",
  "worktrees",
  "context",
  "approvals",
  "extensions",
  "delegations",
  "cron",
] as const;

export const SIDEBAR_SECTIONS = [
  ...CENTER_TABS,
  "logs",
  "profiles",
  "theme_gallery",
  "settings",
] as const;

export const BOTTOM_TABS = ["activity", "logs", "diagnostics"] as const;

export type CenterTab = (typeof CENTER_TABS)[number];
export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];
export type BottomTab = (typeof BOTTOM_TABS)[number];

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

interface LayoutState {
  activeTab: CenterTab;
  sidebarCollapsed: boolean;
  showRightPanel: boolean;
  showBottomPanel: boolean;
  sidebarSection: SidebarSection;
  bottomTab: BottomTab;
  sidebarWidth: number;
  rightPanelWidth: number;
  bottomPanelHeight: number;
  setActiveTab: (tab: CenterTab | string) => void;
  showSidebar: () => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setSidebarSection: (section: SidebarSection | string) => void;
  setBottomTab: (tab: BottomTab | "adapter_diagnostics" | string) => void;
  setSidebarWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;
  resetPanelSizes: () => void;
}

const initialSizes = readSizes();

export const useLayoutStore = create<LayoutState>((set, get) => ({
  activeTab: "runs",
  sidebarCollapsed: false,
  showRightPanel: true,
  showBottomPanel: true,
  sidebarSection: "runs",
  bottomTab: "activity",
  sidebarWidth: initialSizes.sidebarWidth ?? 284,
  rightPanelWidth: initialSizes.rightPanelWidth ?? 360,
  bottomPanelHeight: initialSizes.bottomPanelHeight ?? 240,

  setActiveTab: (tab) => set((s) => ({ activeTab: isCenterTab(tab) ? tab : s.activeTab })),
  showSidebar: () => set({ sidebarCollapsed: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleRightPanel: () => set((s) => ({ showRightPanel: !s.showRightPanel })),
  toggleBottomPanel: () => set((s) => ({ showBottomPanel: !s.showBottomPanel })),
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
