import { create } from "zustand";
import type { Delegation, DelegationDetail } from "../api/studioClient";
import * as api from "../api/studioClient";

interface DelegationState {
  delegations: Delegation[];
  selectedDelegation: DelegationDetail | null;
  selectedDelegationId: string | null;
  loading: boolean;
  error: string | null;
  lastLoadedAt: string | null;
  loadDelegations: (params?: api.DelegationListParams) => Promise<void>;
  loadDelegationDetail: (delegationId: string) => Promise<void>;
  selectDelegation: (delegationId: string | null) => void;
  refresh: () => Promise<void>;
}

function messageFromError(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

export const useDelegationStore = create<DelegationState>((set, get) => ({
  delegations: [],
  selectedDelegation: null,
  selectedDelegationId: null,
  loading: false,
  error: null,
  lastLoadedAt: null,

  loadDelegations: async (params) => {
    set({ loading: true, error: null });
    try {
      const data = await api.listDelegations({ limit: 100, ...params });
      set((state) => ({
        delegations: data.delegations,
        selectedDelegationId: state.selectedDelegationId ?? data.delegations[0]?.id ?? null,
        loading: false,
        lastLoadedAt: nowIso(),
      }));
      const selectedId = get().selectedDelegationId;
      if (selectedId) await get().loadDelegationDetail(selectedId);
    } catch (err) {
      set({
        loading: false,
        error: messageFromError(err, "Delegations unavailable"),
      });
    }
  },

  loadDelegationDetail: async (delegationId) => {
    set({ selectedDelegationId: delegationId, error: null });
    try {
      const detail = await api.getDelegation(delegationId);
      set({
        selectedDelegation: detail,
        selectedDelegationId: detail.id,
      });
    } catch (err) {
      set({ error: messageFromError(err, "Delegation detail unavailable") });
    }
  },

  selectDelegation: (delegationId) => {
    set({ selectedDelegationId: delegationId, selectedDelegation: null });
    if (delegationId) {
      void get().loadDelegationDetail(delegationId);
    }
  },

  refresh: async () => {
    await get().loadDelegations();
  },
}));
