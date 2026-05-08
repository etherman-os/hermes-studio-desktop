import { create } from "zustand";
import * as api from "../api/studioClient";

interface HermesInventoryState {
  summary: api.HermesInventorySummary | null;
  providers: api.HermesProvider[];
  models: api.HermesModel[];
  skills: api.HermesSkill[];
  mcpServers: api.HermesMcpServer[];
  toolsets: api.HermesToolset[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  loadInventory: () => Promise<void>;
  refreshModels: (params?: { provider?: string; query?: string; limit?: number }) => Promise<void>;
  clearError: () => void;
}

export const useHermesInventoryStore = create<HermesInventoryState>((set) => ({
  summary: null,
  providers: [],
  models: [],
  skills: [],
  mcpServers: [],
  toolsets: [],
  loading: false,
  loaded: false,
  error: null,

  loadInventory: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getHermesInventory();
      set({
        summary: data.summary,
        providers: data.providers,
        models: data.models,
        skills: data.skills,
        mcpServers: data.mcp_servers,
        toolsets: data.toolsets,
        loading: false,
        loaded: true,
      });
    } catch (err) {
      set({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : "Failed to load Hermes inventory",
      });
    }
  },

  refreshModels: async (params) => {
    set({ error: null });
    try {
      const data = await api.getHermesModels(params);
      set({ models: data.models, summary: data.summary });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load Hermes models" });
    }
  },

  clearError: () => set({ error: null }),
}));
