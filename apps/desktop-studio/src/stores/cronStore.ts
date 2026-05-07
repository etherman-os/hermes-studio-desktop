import { create } from "zustand";
import type { CronJob } from "../api/studioClient";
import * as api from "../api/studioClient";

interface CronState {
  jobs: CronJob[];
  selectedJob: CronJob | null;
  selectedJobId: string | null;
  loading: boolean;
  error: string | null;
  lastLoadedAt: string | null;
  loadJobs: () => Promise<void>;
  selectJob: (jobId: string | null) => void;
  refresh: () => Promise<void>;
}

function messageFromError(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

export const useCronStore = create<CronState>((set, get) => ({
  jobs: [],
  selectedJob: null,
  selectedJobId: null,
  loading: false,
  error: null,
  lastLoadedAt: null,

  loadJobs: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.listCronJobs();
      set((state) => ({
        jobs: data.jobs,
        selectedJobId: state.selectedJobId ?? data.jobs[0]?.id ?? null,
        selectedJob: state.selectedJob ?? data.jobs[0] ?? null,
        loading: false,
        lastLoadedAt: nowIso(),
      }));
    } catch (err) {
      set({
        loading: false,
        error: messageFromError(err, "Cron jobs unavailable"),
      });
    }
  },

  selectJob: (jobId) => {
    const job = get().jobs.find((j) => j.id === jobId) ?? null;
    set({ selectedJobId: jobId, selectedJob: job });
  },

  refresh: async () => {
    await get().loadJobs();
  },
}));
