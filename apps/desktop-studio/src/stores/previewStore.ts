import { create } from "zustand";

interface PreviewState {
  currentUrl: string;
  currentHtml: string;
  isOpen: boolean;
  consoleLogs: ConsoleEntry[];
  setCurrentUrl: (url: string) => void;
  setCurrentHtml: (html: string) => void;
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
  currentHtml: "",
  isOpen: false,
  consoleLogs: [],

  setCurrentUrl: (url) => set({ currentUrl: url, currentHtml: "" }),
  setCurrentHtml: (html) => set({ currentHtml: html, currentUrl: "" }),
  setOpen: (open) => set({ isOpen: open }),
  addConsoleLog: (entry) =>
    set((s) => ({
      consoleLogs: [...s.consoleLogs.slice(-199), entry],
    })),
  clearConsoleLogs: () => set({ consoleLogs: [] }),
}));
