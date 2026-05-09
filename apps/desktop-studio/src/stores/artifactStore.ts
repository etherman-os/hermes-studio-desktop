import { create } from "zustand";
import type {
  Artifact,
  ArtifactCreateRequest,
  ArtifactDetail,
  ArtifactListParams,
  ArtifactVariantCreateRequest,
  ArtifactVariantGroup,
  ArtifactVariantGroupCreateRequest,
  ArtifactUpdateRequest,
} from "../api/studioClient";
import * as api from "../api/studioClient";

interface ArtifactState {
  artifacts: Artifact[];
  selectedArtifact: ArtifactDetail | null;
  selectedArtifactId: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  actionMessage: string | null;
  filterType: string;
  search: string;
  lastLoadedAt: string | null;
  loadArtifacts: (params?: ArtifactListParams) => Promise<void>;
  selectArtifact: (artifactId: string) => Promise<void>;
  createArtifact: (input: ArtifactCreateRequest) => Promise<ArtifactDetail | null>;
  updateArtifact: (artifactId: string, input: ArtifactUpdateRequest) => Promise<ArtifactDetail | null>;
  revertArtifact: (artifactId: string, version: number) => Promise<ArtifactDetail | null>;
  createVariantGroup: (artifactId: string, input: ArtifactVariantGroupCreateRequest) => Promise<ArtifactVariantGroup | null>;
  addVariant: (groupId: string, input: ArtifactVariantCreateRequest) => Promise<ArtifactVariantGroup | null>;
  applyVariant: (groupId: string, variantId: string) => Promise<ArtifactDetail | null>;
  archiveArtifact: (artifactId: string) => Promise<ArtifactDetail | null>;
  runBrowserEvidence: (artifactId: string) => Promise<ArtifactDetail | null>;
  linkArtifactToRun: (artifactId: string, runId: string) => Promise<ArtifactDetail | null>;
  linkArtifactToSession: (artifactId: string, sessionId: string) => Promise<ArtifactDetail | null>;
  linkArtifactToCard: (artifactId: string, cardId: string) => Promise<ArtifactDetail | null>;
  setFilterType: (type: string) => void;
  setSearch: (search: string) => void;
  clearActionMessage: () => void;
}

function messageFromError(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function replaceArtifact(list: Artifact[], artifact: ArtifactDetail) {
  if (artifact.archived_at) {
    return list.filter((item) => item.id !== artifact.id);
  }
  const summary: Artifact = {
    ...artifact,
    content_text: undefined,
    events: undefined,
  } as Artifact;
  const exists = list.some((item) => item.id === artifact.id);
  if (!exists) return [summary, ...list];
  return list.map((item) => (item.id === artifact.id ? summary : item));
}

function replaceVariantGroup(artifact: ArtifactDetail | null, group: ArtifactVariantGroup) {
  if (!artifact || artifact.id !== group.source_artifact_id) return artifact;
  const groups = artifact.variant_groups ?? [];
  const exists = groups.some((item) => item.id === group.id);
  const nextGroups = exists
    ? groups.map((item) => (item.id === group.id ? group : item))
    : [group, ...groups];
  return { ...artifact, variant_groups: nextGroups };
}

export const useArtifactStore = create<ArtifactState>((set, get) => ({
  artifacts: [],
  selectedArtifact: null,
  selectedArtifactId: null,
  loading: false,
  saving: false,
  error: null,
  actionMessage: null,
  filterType: "all",
  search: "",
  lastLoadedAt: null,

  loadArtifacts: async (params) => {
    const state = get();
    const effective: ArtifactListParams = {
      type: state.filterType === "all" ? undefined : state.filterType,
      search: state.search || undefined,
      limit: 100,
      ...params,
    };
    set({ loading: true, error: null });
    try {
      const data = await api.listArtifacts(effective);
      set({
        artifacts: data.artifacts,
        loading: false,
        lastLoadedAt: nowIso(),
        selectedArtifactId: data.artifacts[0]?.id ?? get().selectedArtifactId,
      });
      const selectedId = get().selectedArtifactId;
      if (selectedId && data.artifacts.some((artifact) => artifact.id === selectedId)) {
        await get().selectArtifact(selectedId);
      } else if (data.artifacts[0]) {
        await get().selectArtifact(data.artifacts[0].id);
      } else {
        set({ selectedArtifact: null, selectedArtifactId: null });
      }
    } catch (err) {
      set({
        loading: false,
        selectedArtifact: null,
        error: messageFromError(err, "Artifacts unavailable"),
      });
    }
  },

  selectArtifact: async (artifactId) => {
    set({ selectedArtifactId: artifactId, error: null });
    try {
      const artifact = await api.getArtifact(artifactId);
      set({ selectedArtifact: artifact, selectedArtifactId: artifact.id });
    } catch (err) {
      set({ error: messageFromError(err, "Artifact detail unavailable") });
    }
  },

  createArtifact: async (input) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const artifact = await api.createArtifact(input);
      set((state) => ({
        artifacts: replaceArtifact(state.artifacts, artifact),
        selectedArtifact: artifact,
        selectedArtifactId: artifact.id,
        saving: false,
        actionMessage: "Artifact created",
      }));
      return artifact;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to create artifact") });
      return null;
    }
  },

  updateArtifact: async (artifactId, input) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const artifact = await api.updateArtifact(artifactId, input);
      set((state) => ({
        artifacts: replaceArtifact(state.artifacts, artifact),
        selectedArtifact: artifact,
        selectedArtifactId: artifact.id,
        saving: false,
        actionMessage: "Artifact updated",
      }));
      return artifact;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to update artifact") });
      return null;
    }
  },

  revertArtifact: async (artifactId, version) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const artifact = await api.revertArtifact(artifactId, version);
      set((state) => ({
        artifacts: replaceArtifact(state.artifacts, artifact),
        selectedArtifact: artifact,
        selectedArtifactId: artifact.id,
        saving: false,
        actionMessage: `Artifact reverted to v${version}`,
      }));
      return artifact;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to revert artifact") });
      return null;
    }
  },

  createVariantGroup: async (artifactId, input) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const group = await api.createArtifactVariantGroup(artifactId, input);
      set((state) => ({
        selectedArtifact: replaceVariantGroup(state.selectedArtifact, group),
        saving: false,
        actionMessage: "Variant group created",
      }));
      return group;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to create variant group") });
      return null;
    }
  },

  addVariant: async (groupId, input) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const group = await api.addArtifactVariant(groupId, input);
      set((state) => ({
        selectedArtifact: replaceVariantGroup(state.selectedArtifact, group),
        saving: false,
        actionMessage: "Variant saved",
      }));
      return group;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to save variant") });
      return null;
    }
  },

  applyVariant: async (groupId, variantId) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const artifact = await api.applyArtifactVariant(groupId, variantId);
      set((state) => ({
        artifacts: replaceArtifact(state.artifacts, artifact),
        selectedArtifact: artifact,
        selectedArtifactId: artifact.id,
        saving: false,
        actionMessage: "Variant applied",
      }));
      return artifact;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to apply variant") });
      return null;
    }
  },

  archiveArtifact: async (artifactId) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const artifact = await api.archiveArtifact(artifactId);
      set((state) => ({
        artifacts: state.artifacts.filter((item) => item.id !== artifactId),
        selectedArtifact: state.selectedArtifactId === artifactId ? null : state.selectedArtifact,
        selectedArtifactId: state.selectedArtifactId === artifactId ? null : state.selectedArtifactId,
        saving: false,
        actionMessage: "Artifact archived",
      }));
      return artifact;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to archive artifact") });
      return null;
    }
  },

  runBrowserEvidence: async (artifactId) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const artifact = await api.runArtifactBrowserEvidence(artifactId);
      set((state) => ({
        artifacts: replaceArtifact(state.artifacts, artifact),
        selectedArtifact: artifact,
        selectedArtifactId: artifact.id,
        saving: false,
        actionMessage: "Browser evidence captured",
      }));
      return artifact;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to capture browser evidence") });
      return null;
    }
  },

  linkArtifactToRun: async (artifactId, runId) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const artifact = await api.linkArtifactToRun(artifactId, runId);
      set((state) => ({
        artifacts: replaceArtifact(state.artifacts, artifact),
        selectedArtifact: artifact,
        saving: false,
        actionMessage: "Artifact linked to run",
      }));
      return artifact;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to link artifact to run") });
      return null;
    }
  },

  linkArtifactToSession: async (artifactId, sessionId) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const artifact = await api.linkArtifactToSession(artifactId, sessionId);
      set((state) => ({
        artifacts: replaceArtifact(state.artifacts, artifact),
        selectedArtifact: artifact,
        saving: false,
        actionMessage: "Artifact linked to session",
      }));
      return artifact;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to link artifact to session") });
      return null;
    }
  },

  linkArtifactToCard: async (artifactId, cardId) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const artifact = await api.linkArtifactToCard(artifactId, cardId);
      set((state) => ({
        artifacts: replaceArtifact(state.artifacts, artifact),
        selectedArtifact: artifact,
        saving: false,
        actionMessage: "Artifact linked to card",
      }));
      return artifact;
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Failed to link artifact to card") });
      return null;
    }
  },

  setFilterType: (filterType) => set({ filterType }),
  setSearch: (search) => set({ search }),
  clearActionMessage: () => set({ actionMessage: null }),
}));
