import { create } from "zustand";
import * as api from "../api/studioClient";
import type { ProcessInfo, ProcessTemplate } from "../api/studioClient";

interface ProcessState {
  processes: ProcessInfo[];
  templates: ProcessTemplate[];
  loading: boolean;
  error: string | null;
  selectedProcessId: string | null;
  processLogs: Record<string, string[]>;
  loadProcesses: () => Promise<void>;
  startProcess: (templateId: string) => Promise<void>;
  stopProcess: (processId: string) => Promise<void>;
  loadLogs: (processId: string, tail?: number) => Promise<void>;
  removeProcess: (processId: string) => Promise<void>;
  selectProcess: (processId: string | null) => void;
  clearError: () => void;
}

export const useProcessStore = create<ProcessState>((set, get) => ({
  processes: [],
  templates: [],
  loading: false,
  error: null,
  selectedProcessId: null,
  processLogs: {},

  loadProcesses: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.listProcesses();
      set({
        processes: data.processes,
        templates: data.templates,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  startProcess: async (templateId) => {
    set({ error: null });
    try {
      const proc = await api.startProcess(templateId);
      set((state) => ({
        processes: [...state.processes.filter((p) => p.id !== proc.id), proc],
        selectedProcessId: proc.id,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  stopProcess: async (processId) => {
    set({ error: null });
    try {
      const proc = await api.stopProcess(processId);
      set((state) => ({
        processes: state.processes.map((p) => (p.id === processId ? proc : p)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  loadLogs: async (processId, tail = 200) => {
    try {
      const data = await api.getProcessLogs(processId, tail);
      set((state) => ({
        processLogs: { ...state.processLogs, [processId]: data.lines },
      }));
    } catch (err) {
      set((state) => {
        const { [processId]: _, ...rest } = state.processLogs;
        return { error: err instanceof Error ? err.message : String(err), processLogs: rest };
      });
    }
  },

  removeProcess: async (processId) => {
    set({ error: null });
    try {
      await api.removeProcess(processId);
      set((state) => ({
        processes: state.processes.filter((p) => p.id !== processId),
        selectedProcessId: state.selectedProcessId === processId ? null : state.selectedProcessId,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  selectProcess: (processId) => {
    set({ selectedProcessId: processId });
    if (processId) {
      void get().loadLogs(processId);
    }
  },

  clearError: () => set({ error: null }),
}));
