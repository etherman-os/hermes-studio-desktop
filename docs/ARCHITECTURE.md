# Architecture

## Overview

Hermes Local Studio is a local-first, themeable desktop workbench for Hermes Agent. It does not modify Hermes core; instead, it wraps Hermes through public/local integration surfaces.

## Layers

```
┌─────────────────────────────────────────────────┐
│ Desktop UI (Tauri v2 + React + TypeScript)      │
│  - Chat / Kanban / Sessions / Artifacts         │
│  - Dockable panels (dockview)                   │
│  - Theme/Layout switcher (concept packs)        │
│  - Command Palette                              │
└─────────────────────┬───────────────────────────┘
                      │ HTTP/SSE (local only)
┌─────────────────────▼───────────────────────────┐
│ Local Shell Adapter (Python)                    │
│  - FastAPI server on 127.0.0.1:39191            │
│  - Token-based auth (rotated per launch)        │
│  - Event normalization                          │
│  - Hermes API client                            │
│  - Hermes CLI wrappers                          │
│  - Read-only local state observer               │
└─────────────────────┬───────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   Hermes API    Hermes CLI   Local State
   /v1/runs      config set   ~/.hermes/state.db
   SSE stream    sessions     ~/.hermes/logs
   capabilities  kanban       ~/.hermes/config.yaml
```

## Design Principles

1. **Adapter is the source of truth.** Frontends must not import Hermes internals.
2. **Stabilize the contract early.** The `/shell/*` API and event schema should change slowly.
3. **Read-only state access.** For sessions, logs, and config observation, prefer read-only access.
4. **Write via CLI wrappers.** For mutations, call official `hermes` CLI commands.
5. **Defensive event handling.** Normalize and sanitize Hermes SSE events; synthesize terminal events when upstream signaling is ambiguous.
6. **Desktop workbench, not terminal.** The main product is a dockable desktop app, not a terminal TUI.

## Package Layout

- `packages/hermes_adapter/` — Python sidecar adapter. Owns the API contract.
- `apps/desktop-studio/` — Tauri v2 + React + TypeScript desktop application.
- `packages/protocol/` — OpenAPI, event schema, theme schema, layout schema (Phase 1).
- `packages/shared-types/` — TypeScript type definitions (Phase 1).
- `themes/` — Data-driven concept packs (theme + layout TOML).
- `legacy/textual-prototype/` — Original Textual TUI (reference only, not maintained).

## Security

- Default bind: `127.0.0.1:39191`
- Token file: `~/.hermes-local-shell/runtime/token` with `0600` permissions
- Token rotated per adapter launch
- Adapter-to-Hermes token kept separate
- Unix domain socket preferred when available
