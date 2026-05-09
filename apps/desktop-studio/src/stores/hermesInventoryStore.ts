import { create } from "zustand";
import * as api from "../api/studioClient";

interface HermesInventoryState {
  summary: api.HermesInventorySummary | null;
  providers: api.HermesProvider[];
  models: api.HermesModel[];
  skills: api.HermesSkill[];
  mcpServers: api.HermesMcpServer[];
  toolsets: api.HermesToolset[];
  fallbackProviders: api.HermesFallbackProvider[];
  mcpProbeResults: Record<string, api.HermesMcpProbeResult>;
  mcpProbing: Record<string, boolean>;
  configuringToolset: Record<string, boolean>;
  skillAction: api.HermesSkillActionResult | null;
  skillActionLoading: boolean;
  cliStatus: api.HermesCliStatus | null;
  releaseStatus: api.HermesReleaseStatus | null;
  releaseLoading: boolean;
  doctorStatus: api.HermesDoctorStatus | null;
  browserCacheStatus: api.HermesBrowserCacheStatus | null;
  checkpointStore: api.HermesCheckpointStoreStatus | null;
  checkpointPruneResult: api.HermesCheckpointPruneResult | null;
  checkpointPruning: boolean;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  loadInventory: () => Promise<void>;
  loadLocalHermesStatus: (options?: { includeDoctor?: boolean }) => Promise<void>;
  checkHermesRelease: () => Promise<void>;
  testMcpServer: (serverId: string) => Promise<void>;
  configureToolset: (input: { id: string; platform: string; enabled: boolean }) => Promise<void>;
  checkSkills: (name?: string) => Promise<void>;
  updateSkills: (name?: string) => Promise<void>;
  installSkill: (input: { identifier: string; category?: string; name?: string; force?: boolean }) => Promise<void>;
  pruneCheckpointStore: (input?: { retention_days?: number; max_size_mb?: number; keep_orphans?: boolean }) => Promise<void>;
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
  fallbackProviders: [],
  mcpProbeResults: {},
  mcpProbing: {},
  configuringToolset: {},
  skillAction: null,
  skillActionLoading: false,
  cliStatus: null,
  releaseStatus: null,
  releaseLoading: false,
  doctorStatus: null,
  browserCacheStatus: null,
  checkpointStore: null,
  checkpointPruneResult: null,
  checkpointPruning: false,
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
        fallbackProviders: data.fallback_providers ?? [],
        loading: false,
        loaded: true,
      });
      void useHermesInventoryStore.getState().loadLocalHermesStatus();
    } catch (err) {
      set({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : "Failed to load Hermes inventory",
      });
    }
  },

  loadLocalHermesStatus: async (options) => {
    set({ error: null });
    try {
      const [cliStatus, checkpointStore, browserCacheStatus, doctorStatus] = await Promise.all([
        api.getHermesCliStatus(),
        api.getHermesCheckpointStoreStatus(),
        api.getHermesBrowserCache(),
        options?.includeDoctor ? api.getHermesDoctor() : Promise.resolve(useHermesInventoryStore.getState().doctorStatus),
      ]);
      set({ cliStatus, checkpointStore, browserCacheStatus, doctorStatus });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load local Hermes status" });
    }
  },

  checkHermesRelease: async () => {
    set({ error: null, releaseLoading: true });
    try {
      const releaseStatus = await api.getHermesRelease();
      set({ releaseStatus, releaseLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to check Hermes release status",
        releaseLoading: false,
      });
    }
  },

  testMcpServer: async (serverId) => {
    set((state) => ({
      error: null,
      mcpProbing: { ...state.mcpProbing, [serverId]: true },
    }));
    try {
      const result = await api.testHermesMcpServer(serverId);
      set((state) => ({
        mcpProbeResults: { ...state.mcpProbeResults, [serverId]: result },
        mcpProbing: { ...state.mcpProbing, [serverId]: false },
      }));
    } catch (err) {
      set((state) => ({
        error: err instanceof Error ? err.message : `Failed to test MCP server ${serverId}`,
        mcpProbing: { ...state.mcpProbing, [serverId]: false },
      }));
    }
  },

  configureToolset: async (input) => {
    const key = `${input.platform}:${input.id}`;
    set((state) => ({
      error: null,
      configuringToolset: { ...state.configuringToolset, [key]: true },
    }));
    try {
      const result = await api.configureHermesToolset(input);
      set((state) => ({
        toolsets: result.toolsets,
        configuringToolset: { ...state.configuringToolset, [key]: false },
      }));
    } catch (err) {
      set((state) => ({
        error: err instanceof Error ? err.message : `Failed to configure ${key}`,
        configuringToolset: { ...state.configuringToolset, [key]: false },
      }));
    }
  },

  checkSkills: async (name) => {
    set({ error: null, skillActionLoading: true });
    try {
      const result = await api.checkHermesSkills(name);
      set({ skillAction: result, skillActionLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to check Hermes skills",
        skillActionLoading: false,
      });
    }
  },

  updateSkills: async (name) => {
    set({ error: null, skillActionLoading: true });
    try {
      const result = await api.updateHermesSkills(name);
      set((state) => ({
        skillAction: result,
        skillActionLoading: false,
        skills: result.skills ?? state.skills,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to update Hermes skills",
        skillActionLoading: false,
      });
    }
  },

  installSkill: async (input) => {
    set({ error: null, skillActionLoading: true });
    try {
      const result = await api.installHermesSkill(input);
      set((state) => ({
        skillAction: result,
        skillActionLoading: false,
        skills: result.skills ?? state.skills,
      }));
      if (result.ok) {
        void useHermesInventoryStore.getState().loadInventory();
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to install Hermes skill",
        skillActionLoading: false,
      });
    }
  },

  pruneCheckpointStore: async (input) => {
    set({ error: null, checkpointPruning: true });
    try {
      const result = await api.pruneHermesCheckpointStore(input);
      set({
        checkpointPruneResult: result,
        checkpointStore: result.status ?? useHermesInventoryStore.getState().checkpointStore,
        checkpointPruning: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to prune Hermes checkpoint store",
        checkpointPruning: false,
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
