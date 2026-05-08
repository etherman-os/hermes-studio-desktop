import type { ThemePack } from "@hermes-studio/shared-types";

const ALL_THEME_VARS = [
  "--app-bg",
  "--app-surface",
  "--app-surface-alt",
  "--app-panel",
  "--app-border",
  "--app-border-subtle",
  "--app-text",
  "--app-text-secondary",
  "--app-text-muted",
  "--app-accent",
  "--app-accent-alt",
  "--app-accent-subtle",
  "--app-ok",
  "--app-warn",
  "--app-danger",
  "--app-info",
  "--kanban-todo",
  "--kanban-doing",
  "--kanban-done",
  "--kanban-blocked",
];

export function applyThemeToDOM(theme: ThemePack) {
  const root = document.documentElement;
  const p = theme.palette ?? {};
  const themeId = theme.meta.id;

  for (const cssVar of ALL_THEME_VARS) {
    root.style.removeProperty(cssVar);
  }

  root.dataset.themeId = themeId;
  root.dataset.themeWorld = themeId.includes("minecraft")
    ? "block"
    : themeId.includes("lotr")
      ? "archive"
      : themeId.includes("minions")
        ? "lab"
        : themeId.includes("light")
          ? "paper"
          : "studio";

  const mapping: Record<string, string | undefined> = {
    "--app-bg": p.bg,
    "--app-surface": p.surface,
    "--app-surface-alt": p.surface_alt,
    "--app-panel": p.panel,
    "--app-border": p.border,
    "--app-border-subtle": p.border_subtle,
    "--app-text": p.text,
    "--app-text-secondary": p.text_secondary,
    "--app-text-muted": p.text_muted,
    "--app-accent": p.accent,
    "--app-accent-alt": p.accent_alt,
    "--app-accent-subtle": p.accent_subtle,
    "--app-ok": p.ok,
    "--app-warn": p.warn,
    "--app-danger": p.danger,
    "--app-info": p.info,
    "--kanban-todo": p.kanban_todo,
    "--kanban-doing": p.kanban_doing,
    "--kanban-done": p.kanban_done,
    "--kanban-blocked": p.kanban_blocked,
  };

  for (const [cssVar, value] of Object.entries(mapping)) {
    if (value) {
      root.style.setProperty(cssVar, value);
    }
  }
}
