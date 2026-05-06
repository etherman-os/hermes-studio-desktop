# Hermes Local Studio — Desktop Studio

This is the main desktop application entry point for Hermes Local Studio.

## Stack

- **Tauri v2** — Desktop app framework (Rust host)
- **React** — UI framework
- **TypeScript** — Type-safe frontend
- **Vite** — Build tool and dev server

> Note: SvelteKit is **not** used. The frontend is React-based.

## Status

Placeholder. The Tauri + React skeleton will be initialized in Phase 2.

## Planned Layout

- Left sidebar: Profiles, Sessions, Search
- Center area: Tabs for Chat, Kanban, Artifacts
- Right sidebar: Model, Tools, Memory, Inspector
- Bottom panel: Activity and Logs
- Command palette (Ctrl+K)
- Theme switcher

## Key Libraries (Planned)

- `dockview` — Dockable panel system (VS Code-like)
- `@tanstack/react-query` — Server state management
- `zustand` — Client state management
- `dnd-kit` — Drag and drop
- Monaco Editor (future) — Code/artifact viewing
