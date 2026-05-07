import { create } from "zustand";

interface PreviewState {
  currentUrl: string;
  isOpen: boolean;
  consoleLogs: ConsoleEntry[];
  setCurrentUrl: (url: string) => void;
  setOpen: (open: boolean) => void;
  addConsoleLog: (entry: ConsoleEntry) => void;
  clearConsoleLogs: () => void;
}

export interface ConsoleEntry {
  level: "log" | "warn" | "error" | "info";
  message: string;
  timestamp: string;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  currentUrl: "",
  isOpen: false,
  consoleLogs: [],

  setCurrentUrl: (url) => set({ currentUrl: url }),
  setOpen: (open) => set({ isOpen: open }),
  addConsoleLog: (entry) =>
    set((s) => ({
      consoleLogs: [...s.consoleLogs.slice(-199), entry],
    })),
  clearConsoleLogs: () => set({ consoleLogs: [] }),
}));
