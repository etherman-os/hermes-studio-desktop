# ADR-0001: Desktop-first workbench, not terminal-first TUI

## Status

Accepted

## Context

The first prototype of Hermes Desktop Studio (then called Hermes Local Shell) was implemented as a terminal-based Textual TUI. This prototype validated the adapter contract, event normalization, theme TOML loading, and basic chat/session interaction patterns.

However, the product goal is a **local-first desktop workbench** comparable to VS Code or Warp — not a terminal-only interface. Terminal TUIs have inherent limitations:

- Panel docking and free-form layout require desktop-level rendering
- Rich theming (CSS variables, transitions, accessibility modes) exceeds terminal capabilities
- Dockable panels, drag-and-drop, Monaco editor integration are not achievable in terminal cells
- The target user experience is "desktop app," not "power-user terminal tool"

## Decision

1. The main product will be a **Tauri v2 + React + TypeScript** desktop application.
2. The existing Textual/TUI prototype is moved to `legacy/textual-prototype/` as reference.
3. The main application entry point is `apps/desktop-studio/`.
4. The Python adapter (`packages/hermes_adapter/`) remains the source of truth for the API contract.
5. The theme system is generic and semantic-slot-based — no concept (Minecraft, Minions, LOTR, etc.) is hardcoded into the application.
6. Hermes core code will **not** be modified, vendored, or forked.

## Consequences

- The main product will not depend on Textual, Ratatui, or terminal rendering frameworks.
- Hermes core will not be modified. Integration happens solely through the adapter layer.
- The Python adapter provides a stable API between the desktop app and Hermes. Frontend can change without affecting the Hermes integration.
- Themes are concept packs (data-driven TOML), not hardcoded skins.
- The legacy Textual prototype is preserved as reference but is not maintained.
- Terminal mode may return in the future as an alt-panel or fallback within the desktop app.
