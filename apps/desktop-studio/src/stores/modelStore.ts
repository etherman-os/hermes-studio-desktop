import { create } from "zustand";
import * as api from "../api/studioClient";
import { useHermesInventoryStore } from "./hermesInventoryStore";

type ModelOption = api.HermesModel;

interface ModelState {
  config: api.ModelConfig | null;
  availableModels: ModelOption[];
  selectedModel: string | null;
  selectedProvider: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  loadConfig: () => Promise<void>;
  loadModels: () => Promise<void>;
  selectModel: (modelId: string) => void;
  selectProvider: (provider: string) => void;
  applySelection: () => Promise<void>;
}

export const useModelStore = create<ModelState>((set, get) => ({
  config: null,
  availableModels: [],
  selectedModel: null,
  selectedProvider: null,
  loading: false,
  saving: false,
  error: null,

  loadConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await api.getModelConfig();
      let models = config.available_models ?? [];

      if (models.length === 0) {
        try {
          const bootstrap = await api.getBootstrap();
          // BootstrapResponse doesn't carry available_models; fall back to listAvailableModels
          const fallback = await api.listAvailableModels();
          models = fallback.models;
        } catch {
          // Non-fatal
        }
      }

      if (models.length === 0) {
        try {
          await useHermesInventoryStore.getState().loadInventory();
          models = useHermesInventoryStore.getState().models;
        } catch {
          // Non-fatal
        }
      }

      set({
        config,
        loading: false,
        selectedModel: get().selectedModel ?? config.model,
        selectedProvider: get().selectedProvider ?? config.provider,
        availableModels: models.length > 0 ? models : get().availableModels,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load model config",
      });
    }
  },

  loadModels: async () => {
    try {
      const data = await api.listAvailableModels();
      set({ availableModels: data.models });
    } catch {
      // Non-fatal, use config.available_models or local Hermes inventory if available
      const config = get().config;
      if (config?.available_models?.length) {
        set({ availableModels: config.available_models });
        return;
      }
      try {
        await useHermesInventoryStore.getState().loadInventory();
        set({ availableModels: useHermesInventoryStore.getState().models });
      } catch {
        // Keep previous state.
      }
    }
  },

  selectModel: (modelId: string) => {
    set({ selectedModel: modelId });
  },

  selectProvider: (provider: string) => {
    set({ selectedProvider: provider });
  },

  applySelection: async () => {
    const { selectedModel, selectedProvider } = get();
    if (!selectedModel && !selectedProvider) return;

    set({ saving: true, error: null });
    try {
      const config = await api.updateModelConfig({
        model: selectedModel ?? undefined,
        provider: selectedProvider ?? undefined,
      });
      set({
        config,
        saving: false,
        selectedModel: config.model,
        selectedProvider: config.provider,
        availableModels: config.available_models?.length ? config.available_models : get().availableModels,
      });
    } catch (err) {
      set({
        saving: false,
        error: err instanceof Error ? err.message : "Failed to update model config",
      });
    }
  },
}));
