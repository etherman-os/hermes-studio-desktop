import { create } from "zustand";

interface LayoutState {
  activeTab: string;
  showRightPanel: boolean;
  showBottomPanel: boolean;
  sidebarSection: string;
  bottomTab: string;
  setActiveTab: (tab: string) => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setSidebarSection: (section: string) => void;
  setBottomTab: (tab: string) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  activeTab: "runs",
  showRightPanel: true,
  showBottomPanel: true,
  sidebarSection: "runs",
  bottomTab: "activity",

  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleRightPanel: () => set((s) => ({ showRightPanel: !s.showRightPanel })),
  toggleBottomPanel: () => set((s) => ({ showBottomPanel: !s.showBottomPanel })),
  setSidebarSection: (section) => set({ sidebarSection: section }),
  setBottomTab: (tab) => set({ bottomTab: tab }),
}));
