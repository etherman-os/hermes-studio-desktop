import { create } from "zustand";
import type { ThemePack } from "@hermes-studio/shared-types";
import { ALL_THEMES as LOCAL_FALLBACK_THEMES } from "../fixtures/themes";
import { applyThemeToDOM } from "../styles/applyTheme";
import * as api from "../api/studioClient";

const DEFAULT_LABELS: Record<string, string> = {
  runs: "Runs",
  mission: "Mission",
  run_ledger: "Run Ledger",
  chat: "Chat",
  board: "Board",
  kanban: "Board",
  sessions: "Sessions",
  design: "Design",
  artifacts: "Artifacts",
  context: "Context",
  logs: "Logs",
  tools: "Tools",
  memory: "Memory",
  activity: "Activity",
  diagnostics: "Diagnostics",
  adapter_diagnostics: "Diagnostics",
  inspector: "Inspector",
  command_palette: "Command Palette",
  settings: "Settings",
  theme_gallery: "Themes",
  approvals: "Approvals",
  more: "More",
  model: "Model",
  processes: "Processes",
  extensions: "Extensions",
  checkpoints: "Checkpoints",
  worktrees: "Worktrees",
  git: "Git",
  delegations: "Delegations",
  cron: "Scheduled",
  automation: "Automation",
};

const DEFAULT_ICONS: Record<string, string> = {
  runs: "R",
  mission: "M",
  run_ledger: "R",
  chat: "C",
  board: "B",
  kanban: "B",
  sessions: "S",
  design: "D",
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
  approvals: "!",
  more: "+",
  model: "M",
  processes: "P",
  extensions: "X",
  checkpoints: "K",
  worktrees: "W",
  delegations: "D",
  cron: "T",
};

export type ThemeMode = "system" | "light" | "dark";

function getSystemTheme(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

function resolveThemeId(mode: ThemeMode, themes: Record<string, ThemePack>): string {
  const effective = mode === "system" ? getSystemTheme() : mode;
  // Try to find a matching light/dark theme
  const candidates = effective === "light"
    ? ["minimal-light", "default-light", "light"]
    : ["default-dark", "dark"];
  for (const id of candidates) {
    if (themes[id]) return id;
  }
  return "default-dark";
}

function resolveThemeAlias(id: string, themes: Record<string, ThemePack>): string {
  if (id === "default-light" && !themes[id] && themes["minimal-light"]) return "minimal-light";
  return id;
}

interface ThemeState {
  activeThemeId: string;
  themeMode: ThemeMode;
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
  setThemeMode: (mode: ThemeMode) => void;
  activateTheme: (id: string) => Promise<void>;
  initTheme: () => void;
  loadThemes: () => Promise<void>;
  reloadThemes: () => Promise<void>;
}

const THEME_MODE_KEY = "hermes-theme-mode";

export const useThemeStore = create<ThemeState>((set, get) => {
  // Track the current system theme media query listener to avoid memory leaks
  let _systemThemeListener: (() => void) | null = null;

  // Restore persisted theme mode from localStorage
  let persistedMode: ThemeMode = "system";
  try {
    const stored = localStorage.getItem(THEME_MODE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      persistedMode = stored;
    }
  } catch {
    // localStorage unavailable
  }

  return {
    activeThemeId: "default-dark",
    themeMode: persistedMode,
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
      if (slot === "approvals" && theme.icons?.approval) return theme.icons.approval;
      return theme.icons?.[slot as keyof typeof theme.icons] ?? DEFAULT_ICONS[slot] ?? "•";
    },

    setTheme: (id: string) => {
      const theme = get().themes[id];
      if (!theme) return;
      set({ activeThemeId: id });
      applyThemeToDOM(theme);
    },

    setThemeMode: (mode: ThemeMode) => {
      const { themes } = get();
      try {
        localStorage.setItem(THEME_MODE_KEY, mode);
      } catch {
        // localStorage unavailable
      }
      const targetId = resolveThemeId(mode, themes);
      const theme = themes[targetId];
      set({ themeMode: mode, activeThemeId: targetId });
      if (theme) applyThemeToDOM(theme);

      // Remove previous system theme listener before registering a new one
      if (_systemThemeListener) {
        _systemThemeListener();
        _systemThemeListener = null;
      }

      // Listen for system theme changes when in system mode
      if (mode === "system" && typeof window !== "undefined" && window.matchMedia) {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => {
          const state = get();
          if (state.themeMode !== "system") return;
          const newId = resolveThemeId("system", state.themes);
          const newTheme = state.themes[newId];
          set({ activeThemeId: newId });
          if (newTheme) applyThemeToDOM(newTheme);
        };
        mq.addEventListener("change", handler);
        _systemThemeListener = () => mq.removeEventListener("change", handler);
      }
    },

    activateTheme: async (id: string) => {
      const requestedId = resolveThemeAlias(id, get().themes);
      set({ error: null });
      try {
        await api.activateTheme(requestedId);
        const normalized = await api.getTheme(requestedId);
        const themePack = adapterThemeToPack(normalized);
        set((s) => ({
          activeThemeId: requestedId,
          themes: { ...s.themes, [requestedId]: themePack },
          error: null,
        }));
        applyThemeToDOM(themePack);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to activate theme";
        set({ error: msg });
        // Fallback to local theme if available
        const local = get().themes[requestedId];
        if (local) {
          set({ activeThemeId: requestedId });
          applyThemeToDOM(local);
        }
      }
    },

    initTheme: () => {
      const { themeMode, themes } = get();
      const targetId = resolveThemeId(themeMode, themes);
      const theme = themes[targetId] ?? get().activeTheme();
      set({ activeThemeId: targetId });
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
        const initialMerged = { ...LOCAL_FALLBACK_THEMES, ...themesFromAdapter };
        let activeId = resolveThemeAlias(data.active ?? "default-dark", initialMerged);
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

        // Resolve effective theme based on mode
        const { themeMode } = get();
        const effectiveId = resolveThemeId(themeMode, merged);

        set({
          themes: merged,
          adapterThemes,
          adapterLoaded: true,
          loading: false,
          activeThemeId: effectiveId,
          error: null,
        });

        // Apply active theme
        const toApply = merged[effectiveId] ?? activePack ?? merged[activeId] ?? merged["default-dark"];
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
  };
});

function adapterThemeToPack(data: api.ThemeData): ThemePack {
  return {
    meta: {
      id: data.meta?.id ?? "unknown",
      name: data.meta?.name ?? "Unknown",
      version: data.meta?.version ?? "0.0.0",
      author: data.meta?.author ?? "unknown",
      description: data.meta?.description,
      extends: data.meta?.extends,
      keywords: Array.isArray(data.meta?.keywords) ? data.meta.keywords.filter((item) => typeof item === "string") : undefined,
    },
    palette: validateStringRecord(data.palette) as ThemePack["palette"],
    typography: validateStringRecord(data.typography) as ThemePack["typography"],
    borders: validateStringRecord(data.borders) as ThemePack["borders"],
    icons: validateStringRecord(data.icons) as ThemePack["icons"],
    labels: validateStringRecord(data.labels) as ThemePack["labels"],
    empty_states: validateStringRecord(data.empty_states) as ThemePack["empty_states"],
    onboarding: validateStringRecord(data.onboarding) as ThemePack["onboarding"],
    kanban: data.kanban as ThemePack["kanban"],
    message_styles: validateStringRecord(data.message_styles) as ThemePack["message_styles"],
    accessibility: data.accessibility as ThemePack["accessibility"],
    assets: validateStringRecord(data.assets) as ThemePack["assets"],
  };
}

function validateStringRecord(obj: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!obj) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}
