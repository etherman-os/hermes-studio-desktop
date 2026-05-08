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

interface LayoutState {
  activeTab: CenterTab;
  sidebarCollapsed: boolean;
  showRightPanel: boolean;
  showBottomPanel: boolean;
  sidebarSection: SidebarSection;
  bottomTab: BottomTab;
  setActiveTab: (tab: CenterTab | string) => void;
  showSidebar: () => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setSidebarSection: (section: SidebarSection | string) => void;
  setBottomTab: (tab: BottomTab | "adapter_diagnostics" | string) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  activeTab: "runs",
  sidebarCollapsed: false,
  showRightPanel: true,
  showBottomPanel: true,
  sidebarSection: "runs",
  bottomTab: "activity",

  setActiveTab: (tab) => set((s) => ({ activeTab: isCenterTab(tab) ? tab : s.activeTab })),
  showSidebar: () => set({ sidebarCollapsed: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleRightPanel: () => set((s) => ({ showRightPanel: !s.showRightPanel })),
  toggleBottomPanel: () => set((s) => ({ showBottomPanel: !s.showBottomPanel })),
  setSidebarSection: (section) => set((s) => ({ sidebarSection: isSidebarSection(section) ? section : s.sidebarSection })),
  setBottomTab: (tab) => set({ bottomTab: normalizeBottomTab(tab) }),
}));
