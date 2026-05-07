# Architecture

## Overview

Hermes Desktop Studio is a local-first, themeable desktop workbench for Hermes Agent. It does not modify Hermes core; instead, it wraps Hermes through public/local integration surfaces.

## Layers

```
┌─────────────────────────────────────────────────┐
│ Desktop UI (Tauri v2 + React + TypeScript)      │
│  - Chat / Kanban / Sessions / Artifacts         │
│  - Desktop panel shell                          │
│  - Theme/Layout switcher (concept packs)        │
│  - Command Palette                              │
└─────────────────────┬───────────────────────────┘
                      │ HTTP/SSE (local only)
┌─────────────────────▼───────────────────────────┐
│ Studio Adapter (Python)                         │
│  - FastAPI server on 127.0.0.1:39191            │
│  - Token-based auth for protected /studio/*     │
│  - Event normalization                          │
│  - Hermes API client                            │
│  - Read-only local state observer               │
│  - Studio-owned SQLite storage                  │
└─────────────────────┬───────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   Hermes API    Hermes CLI   Local State
   /v1/runs      config set   ~/.hermes/state.db
   SSE stream    profiles     ~/.hermes/logs
   capabilities  official     ~/.hermes/config.yaml
                              studio.db (Studio-owned)
```

## Design Principles

1. **Adapter is the source of truth.** Frontends must not import Hermes internals.
2. **Stabilize the contract early.** The `/studio/*` API and event schema should change slowly and stay covered by OpenAPI/schema parity tests.
3. **Read-only state access.** For sessions, logs, and config observation, prefer read-only access.
4. **Write via CLI wrappers.** For mutations, call official `hermes` CLI commands.
5. **Defensive event handling.** Normalize and sanitize Hermes SSE events; every emitted Studio event includes `id`, `type`, `timestamp`, `source`, and `payload`.
6. **Studio-owned persistence.** Local Studio features use `studio.db`, separate from Hermes Agent `state.db`, and never store secrets.
7. **Desktop workbench, not terminal.** The main product is a dockable desktop app, not a terminal TUI.

## Package Layout

- `apps/desktop-studio/` — Tauri v2 + React + TypeScript desktop application.
- `packages/hermes_adapter/` — Python sidecar adapter. Owns the API contract.
- `packages/protocol/` — OpenAPI, event schema, theme schema, layout schema, plugin schema, tool pack schema.
- `packages/shared-types/` — TypeScript type definitions (events, theme, layout, plugin).
- `tool-packs/` — Tool pack definitions (example-tools and user-created packs).
- `themes/` — Data-driven concept packs (theme + layout TOML).
- `legacy/textual-prototype/` — Original Textual TUI (reference only, not maintained).

## Security

- Default bind: `127.0.0.1:39191`
- Canonical desktop health: `GET /studio/health`
- Root `GET /health` is adapter/dev tooling health only
- Token file: `~/.hermes-local-shell/runtime/token` with `0600` permissions
- Token rotated per adapter launch unless `HERMES_STUDIO_ADAPTER_TOKEN` is set for dev
- Tauri reads the token through a Rust command bridge; frontend keeps it in memory and does not use `localStorage`
- Adapter-to-Hermes token kept separate
- Legacy `/shell/*` routes are disabled unless `HERMES_STUDIO_ENABLE_LEGACY_SHELL_ROUTES=1`
- Tauri CSP is restrictive for local app usage; dev allows localhost adapter/Vite connections
- Secret guard with 14 detection patterns for input/output scanning
- Input validator for all API inputs (path params, query params, request bodies)
- Audit logging to `studio.db` for security-relevant operations
- DB hardening: WAL mode, backup rotation, integrity checks
- Token security: rotation, expiry, rate limiting
- TOCTOU-safe token file creation
