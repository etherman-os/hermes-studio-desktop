# Hermes Local Studio

A local-first, themeable desktop workbench for [Hermes Agent](https://github.com/NousResearch/hermes-agent).

Hermes Local Studio is **not** a terminal-only TUI. It is a desktop-class application — closer to Warp, VS Code, or a modern desktop IDE — designed for users who run Hermes primarily on their own machine.

## Why a Desktop Workbench?

Terminal TUIs have inherent ceilings in visual ergonomics, panel docking, drag-and-drop layout, rich theming, and accessibility. Hermes Local Studio uses **Tauri v2 + React** to provide a full desktop experience: dockable panels, streaming chat, Kanban boards, session management, live logs, and user-installable concept packs — all without requiring users to live inside a terminal.

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop app | **Tauri v2** (Rust host) |
| Frontend | **React + TypeScript + Vite** |
| State management | **Zustand** (client), **TanStack Query** (server) |
| Dockable panels | **dockview** |
| Hermes integration | **Python adapter** (sidecar) |
| Theme/config | **TOML** concept packs + CSS variables |

> Note: SvelteKit is **not** used. The frontend is React-based.

## Architecture

```
┌──────────────────────────────────────────┐
│ Desktop UI (Tauri v2 + React)            │
│ Chat / Kanban / Sessions / Logs / Themes │
└──────────────────┬───────────────────────┘
                    │ HTTP/SSE (local only)
┌──────────────────▼───────────────────────┐
│ Local Shell Adapter (Python)             │
│ FastAPI + SSE + Pydantic                 │
│ 127.0.0.1:39191                          │
└──────────────────┬───────────────────────┘
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
 Hermes API    Hermes CLI   Local State
 /v1/runs      config/set   ~/.hermes/state.db
 SSE stream    sessions     ~/.hermes/logs
 capabilities  kanban       ~/.hermes/config.yaml
```

## Core Principles

- **Do not modify Hermes core.** Wrap it through public integration surfaces only.
- **Adapter-first:** UI never talks to Hermes directly; it talks to the local adapter.
- **Desktop workbench, not terminal TUI.** The main product is a dockable desktop app.
- **Generic theme system:** Colors, icons, labels, layout, and terminology are driven by concept packs. No concept is hardcoded.
- **Local-only by default:** Bind 127.0.0.1, rotate tokens per launch, never expose without key.
- **Future-proof:** Same adapter contract supports desktop shell today, terminal mode later.

## Project Structure

```
hermes-local-studio/
  apps/
    desktop-studio/            # Tauri v2 + React + TypeScript desktop app
  packages/
    hermes_adapter/           # Python sidecar adapter (source of truth for API contract)
    py-adapter/               # Future rename target (placeholder)
    protocol/                 # OpenAPI / event schema / theme schema (Phase 1)
    shared-types/             # TypeScript types (Phase 1)
  themes/
    default-dark/             # Base theme pack
    minecraft-overworld/      # Example concept pack (extends default-dark)
    example-minions/          # Example concept pack (placeholder)
    example-lotr/             # Example concept pack (placeholder)
  legacy/
    textual-prototype/        # Original Textual TUI (reference only, not maintained)
  docs/
    ARCHITECTURE.md
    ADAPTER_CONTRACT.md
    THEME_SYSTEM.md
    ROADMAP.md
    PRODUCT_DIRECTION.md
    ADR-0001-desktop-first.md
```

## Theme / Concept Pack System

Hermes Local Studio supports arbitrary **concept packs** — not just color themes, but complete visual and linguistic re-skins:

- Minecraft, Minions, Lord of the Rings, Cyberpunk, Minimal, Anime, anything users create
- Each concept pack can override: colors, icons, labels, panel names, terminology, layout defaults, density, card styles, kanban column styling, command palette labels, empty states, onboarding copy, and optional decorative assets

The core app uses **semantic slots** (`profiles`, `sessions`, `chat`, `kanban`, `tools`, `memory`, `logs`, `activity`, `inspector`, `command_palette`). Themes map those slots to their own language. No concept is hardcoded into the application.

## Development

```bash
# Install all dependencies
pnpm install

# Start the Python adapter (FastAPI on 127.0.0.1:39191)
pnpm run dev:adapter

# Start frontend dev server (browser)
pnpm run dev:desktop

# Build frontend (tsc + vite)
pnpm --filter @hermes-desktop-studio/desktop-studio build

# Run adapter tests
source .venv/bin/activate && pytest packages/hermes_adapter/tests/
```

### Health Endpoints

The adapter exposes two health endpoints (both return the same shape):
- `GET /health` — root-level, no auth required
- `GET /studio/health` — under studio router, no auth required

## Development Status

See [docs/ROADMAP.md](docs/ROADMAP.md) for the current phase and milestone plan.

## License

MIT
