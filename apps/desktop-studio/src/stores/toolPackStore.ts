import { create } from "zustand";
import * as api from "../api/studioClient";
import type { ToolPackInfo } from "../api/studioClient";

interface ToolPackState {
  packs: ToolPackInfo[];
  loading: boolean;
  error: string | null;
  loadPacks: () => Promise<void>;
  enablePack: (packId: string) => Promise<void>;
  disablePack: (packId: string) => Promise<void>;
  installPack: (sourcePath: string) => Promise<void>;
  clearError: () => void;
}

export const useToolPackStore = create<ToolPackState>((set, get) => ({
  packs: [],
  loading: false,
  error: null,

  loadPacks: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getToolPacks();
      set({ packs: data.packs, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  enablePack: async (packId: string) => {
    set({ error: null });
    try {
      const updated = await api.enableToolPack(packId);
      set((state) => ({
        packs: state.packs.map((p) => (p.id === packId ? updated : p)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  disablePack: async (packId: string) => {
    set({ error: null });
    try {
      const updated = await api.disableToolPack(packId);
      set((state) => ({
        packs: state.packs.map((p) => (p.id === packId ? updated : p)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  installPack: async (sourcePath: string) => {
    set({ error: null });
    try {
      const installed = await api.installToolPack(sourcePath);
      set((state) => {
        const exists = state.packs.some((p) => p.id === installed.id);
        return {
          packs: exists
            ? state.packs.map((p) => (p.id === installed.id ? installed : p))
            : [...state.packs, installed],
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  clearError: () => set({ error: null }),
}));
