import { create } from "zustand";
import * as api from "../api/studioClient";
import type { Checkpoint, CheckpointDiffResponse } from "../api/studioClient";

interface CheckpointState {
  checkpoints: Checkpoint[];
  selectedHash: string | null;
  diff: CheckpointDiffResponse | null;
  loading: boolean;
  diffLoading: boolean;
  error: string | null;
  isGitRepo: boolean;
  workspace: string | null;

  loadCheckpoints: (workspacePath: string) => Promise<void>;
  selectCheckpoint: (hash: string | null) => void;
  loadDiff: (hash: string, workspacePath: string) => Promise<void>;
  clearDiff: () => void;
}

export const useCheckpointStore = create<CheckpointState>((set, get) => ({
  checkpoints: [],
  selectedHash: null,
  diff: null,
  loading: false,
  diffLoading: false,
  error: null,
  isGitRepo: false,
  workspace: null,

  loadCheckpoints: async (workspacePath) => {
    set({ loading: true, error: null });
    try {
      const data = await api.listCheckpoints(workspacePath);
      set({
        checkpoints: data.checkpoints,
        isGitRepo: data.is_git_repo,
        workspace: data.workspace,
        loading: false,
        error: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  selectCheckpoint: (hash) => {
    set({ selectedHash: hash, diff: null });
  },

  loadDiff: async (hash, workspacePath) => {
    set({ diffLoading: true });
    try {
      const data = await api.getCheckpointDiff(hash, workspacePath);
      set({ diff: data, diffLoading: false });
    } catch (err) {
      set({
        diffLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  clearDiff: () => set({ diff: null, selectedHash: null }),
}));
