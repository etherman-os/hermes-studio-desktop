/**
 * URL routing for Hermes Desktop Studio.
 * URL scheme: /studio/{mode}/{surface}
 * - Default: /studio/create/chat (CREATE mode, chat surface)
 * - Mode-only: /studio/code → /studio/code/runs (CODE mode, first surface)
 */

import { type Mode, MODE_SURFACES, MODE_HOME_SURFACE } from "../stores/layoutStore";

export const STUDIO_BASE = "/studio";

export const VALID_MODES: Mode[] = ["create", "code", "automate", "manage"];

export interface StudioRoute {
  mode: Mode;
  surface: string;
}

/**
 * Parse the current pathname into a StudioRoute.
 * Falls back to default (/studio/create/chat) if path is invalid.
 */
export function parseStudioUrl(pathname: string): StudioRoute {
  const parts = pathname.split("/").filter(Boolean); // ["studio", "create", "chat"]
  if (parts[0] !== "studio") {
    return { mode: "create", surface: "chat" };
  }

  const mode = parts[1] as Mode;
  if (!VALID_MODES.includes(mode)) {
    return { mode: "create", surface: "chat" };
  }

  const surface = parts[2] ?? MODE_HOME_SURFACE[mode];
  return { mode, surface };
}

/**
 * Build a studio URL path from mode and surface.
 */
export function buildStudioPath(mode: Mode, surface: string): string {
  return `${STUDIO_BASE}/${mode}/${surface}`;
}

/**
 * Push a new studio URL to browser history without full page reload.
 */
export function pushStudioUrl(mode: Mode, surface: string) {
  const path = buildStudioPath(mode, surface);
  window.history.pushState({ mode, surface }, "", path);
}

/**
 * Initialize the URL to match the current store state.
 * Call this once on app boot to set the correct URL.
 */
export function syncUrlFromStore(mode: Mode, surface: string) {
  const path = buildStudioPath(mode, surface);
  window.history.replaceState({ mode, surface }, "", path);
}

/**
 * Get the URL path for a given mode + surface combo.
 */
export function getStudioPath(mode: Mode, surface: string): string {
  return buildStudioPath(mode, surface);
}