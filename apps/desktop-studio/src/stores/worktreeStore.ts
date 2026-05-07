import { create } from "zustand";
import * as api from "../api/studioClient";
import type { Worktree } from "../api/studioClient";

interface WorktreeState {
  worktrees: Worktree[];
  loading: boolean;
  creating: boolean;
  error: string | null;
  actionMessage: string | null;
  isGitRepo: boolean;
  workspace: string | null;

  loadWorktrees: (workspacePath: string) => Promise<void>;
  createWorktree: (workspacePath: string, branch: string) => Promise<boolean>;
  removeWorktree: (worktreeId: string) => Promise<boolean>;
  startRun: (worktreeId: string, prompt: string, sessionId?: string) => Promise<string | null>;
  clearActionMessage: () => void;
}

export const useWorktreeStore = create<WorktreeState>((set, get) => ({
  worktrees: [],
  loading: false,
  creating: false,
  error: null,
  actionMessage: null,
  isGitRepo: false,
  workspace: null,

  loadWorktrees: async (workspacePath) => {
    set({ loading: true, error: null });
    try {
      const data = await api.listWorktrees(workspacePath);
      set({
        worktrees: data.worktrees,
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

  createWorktree: async (workspacePath, branch) => {
    set({ creating: true, actionMessage: null, error: null });
    try {
      await api.createWorktree(workspacePath, branch);
      set({ creating: false, actionMessage: `Worktree created for branch '${branch}'` });
      await get().loadWorktrees(workspacePath);
      return true;
    } catch (err) {
      set({
        creating: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  removeWorktree: async (worktreeId) => {
    set({ actionMessage: null, error: null });
    try {
      await api.removeWorktree(worktreeId);
      set((state) => ({
        worktrees: state.worktrees.filter((wt) => wt.id !== worktreeId),
        actionMessage: "Worktree removed",
      }));
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  startRun: async (worktreeId, prompt, sessionId) => {
    set({ actionMessage: null, error: null });
    try {
      const result = await api.startRunInWorktree(worktreeId, {
        prompt,
        session_id: sessionId ?? "default",
      });
      set({ actionMessage: `Run started in worktree: ${result.run_id}` });
      return result.run_id;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  clearActionMessage: () => set({ actionMessage: null }),
}));
