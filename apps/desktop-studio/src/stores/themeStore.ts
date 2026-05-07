import { create } from "zustand";
import type { ThemePack } from "@hermes-studio/shared-types";
import { ALL_THEMES as LOCAL_FALLBACK_THEMES } from "../fixtures/themes";
import { applyThemeToDOM } from "../styles/applyTheme";
import * as api from "../api/studioClient";

const DEFAULT_LABELS: Record<string, string> = {
  runs: "Runs",
  run_ledger: "Run Ledger",
  chat: "Chat",
  board: "Board",
  kanban: "Board",
  sessions: "Sessions",
  artifacts: "Artifacts",
  context: "Context",
  logs: "Logs",
  tools: "Tools",
  memory: "Memory",
  activity: "Activity",
  diagnostics: "Diagnostics",
  adapter_diagnostics: "Adapter Diagnostics",
  inspector: "Inspector",
  command_palette: "Command Palette",
  settings: "Settings",
  theme_gallery: "Themes",
  approvals: "Approvals",
  model: "Model",
};

const DEFAULT_ICONS: Record<string, string> = {
  runs: "R",
  run_ledger: "R",
  chat: "C",
  board: "B",
  kanban: "B",
  sessions: "S",
  artifacts: "A",
  context: "@",
  logs: "L",
  tools: "T",
  memory: "M",
  activity: "!",
  diagnostics: "D",
  adapter_diagnostics: "D",
  inspector: "I",
  command_palette: ">",
  settings: "*",
  theme_gallery: "#",
  approvals: "?",
  model: "M",
};

interface ThemeState {
  activeThemeId: string;
  themes: Record<string, ThemePack>;
  adapterThemes: api.ThemeInfo[];
  adapterLoaded: boolean;
  loading: boolean;
  error: string | null;
  activeTheme: () => ThemePack;
  installedThemes: () => api.ThemeInfo[];
  invalidThemes: () => api.ThemeInfo[];
  label: (slot: string) => string;
  icon: (slot: string) => string;
  setTheme: (id: string) => void;
  activateTheme: (id: string) => Promise<void>;
  initTheme: () => void;
  loadThemes: () => Promise<void>;
  reloadThemes: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  activeThemeId: "default-dark",
  themes: { ...LOCAL_FALLBACK_THEMES },
  adapterThemes: [],
  adapterLoaded: false,
  loading: false,
  error: null,

  activeTheme: () => {
    const { activeThemeId, themes } = get();
    return themes[activeThemeId] ?? themes["default-dark"] ?? Object.values(themes)[0];
  },

  installedThemes: () => get().adapterThemes,

  invalidThemes: () => get().adapterThemes.filter((t) => !(t as { valid?: boolean }).valid),

  label: (slot: string) => {
    const theme = get().activeTheme();
    return theme.labels?.[slot as keyof typeof theme.labels] ?? DEFAULT_LABELS[slot] ?? slot;
  },

  icon: (slot: string) => {
    const theme = get().activeTheme();
    return theme.icons?.[slot as keyof typeof theme.icons] ?? DEFAULT_ICONS[slot] ?? "•";
  },

  setTheme: (id: string) => {
    const theme = get().themes[id];
    if (!theme) return;
    set({ activeThemeId: id });
    applyThemeToDOM(theme);
  },

  activateTheme: async (id: string) => {
    set({ error: null });
    try {
      await api.activateTheme(id);
      const normalized = await api.getTheme(id);
      const themePack = adapterThemeToPack(normalized);
      set((s) => ({
        activeThemeId: id,
        themes: { ...s.themes, [id]: themePack },
        error: null,
      }));
      applyThemeToDOM(themePack);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to activate theme";
      set({ error: msg });
      // Fallback to local theme if available
      const local = get().themes[id];
      if (local) {
        set({ activeThemeId: id });
        applyThemeToDOM(local);
      }
    }
  },

  initTheme: () => {
    const theme = get().activeTheme();
    applyThemeToDOM(theme);
  },

  loadThemes: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getThemes();
      const adapterThemes = data.themes;

      // Load all adapter themes as normalized ThemePacks
      const themesFromAdapter: Record<string, ThemePack> = {};
      for (const info of adapterThemes) {
        try {
          const normalized = await api.getTheme(info.id);
          themesFromAdapter[info.id] = adapterThemeToPack(normalized);
        } catch {
          // Skip themes that fail to load
        }
      }

      // Load active theme
      let activeId = data.active ?? "default-dark";
      let activePack: ThemePack | null = null;
      try {
        const activeData = await api.getActiveTheme();
        activePack = adapterThemeToPack(activeData);
        if (!themesFromAdapter[activeId]) {
          themesFromAdapter[activeId] = activePack;
        }
      } catch {
        // Keep fallback
      }

      // Merge: adapter themes take priority, local fallback fills gaps
      const merged = { ...LOCAL_FALLBACK_THEMES, ...themesFromAdapter };

      set({
        themes: merged,
        adapterThemes,
        adapterLoaded: true,
        loading: false,
        activeThemeId: activeId,
        error: null,
      });

      // Apply active theme
      const toApply = activePack ?? merged[activeId] ?? merged["default-dark"];
      if (toApply) applyThemeToDOM(toApply);

    } catch (err) {
      set({
        adapterLoaded: true,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load themes",
      });
      // Keep local fallback
      const fallback = get().activeTheme();
      applyThemeToDOM(fallback);
    }
  },

  reloadThemes: async () => {
    set({ loading: true, error: null });
    try {
      await api.reloadThemes();
      await get().loadThemes();
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Failed to reload themes" });
    }
  },
}));

function adapterThemeToPack(data: api.ThemeData): ThemePack {
  return {
    meta: {
      id: data.meta?.id ?? "unknown",
      name: data.meta?.name ?? "Unknown",
      version: data.meta?.version ?? "0.0.0",
      author: data.meta?.author ?? "unknown",
      description: data.meta?.description,
      extends: data.meta?.extends,
    },
    palette: data.palette as ThemePack["palette"],
    typography: data.typography as ThemePack["typography"],
    borders: data.borders as ThemePack["borders"],
    icons: data.icons as ThemePack["icons"],
    labels: data.labels as ThemePack["labels"],
    empty_states: data.empty_states as ThemePack["empty_states"],
    onboarding: data.onboarding as ThemePack["onboarding"],
    kanban: data.kanban as ThemePack["kanban"],
    message_styles: data.message_styles as ThemePack["message_styles"],
    accessibility: data.accessibility as ThemePack["accessibility"],
    assets: data.assets as ThemePack["assets"],
  };
}
