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
| State management | **Zustand** |
| Layout | React/CSS panel shell |
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
│ Studio Adapter (Python)                  │
│ FastAPI + SSE + Pydantic                 │
│ 127.0.0.1:39191                          │
└──────────────────┬───────────────────────┘
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
 Hermes API    Hermes CLI   Local State
 /v1/runs      config/set   ~/.hermes/state.db
 SSE stream    sessions     ~/.hermes/logs
 capabilities  profiles     ~/.hermes/config.yaml
```

## Core Principles

- **Do not modify Hermes core.** Wrap it through public integration surfaces only.
- **Adapter-first:** UI never talks to Hermes directly; it talks to the local adapter.
- **Studio protocol only:** Desktop frontend calls `/studio/*`; root `/health` is adapter/dev tooling health only.
- **Desktop workbench, not terminal TUI.** The main product is a dockable desktop app.
- **Generic theme system:** Colors, icons, labels, layout, and terminology are driven by concept packs. No concept is hardcoded.
- **Local-only by default:** Bind 127.0.0.1, rotate tokens per launch, never expose without key.
- **Read-only Hermes observation:** Hermes `state.db`, logs, profiles, and model/provider config are read without mutation unless an official safe write path exists.
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
    STUDIO_STORAGE.md
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

# Browser dev with protected /studio/* calls
VITE_HERMES_STUDIO_ADAPTER_TOKEN="$(cat ~/.hermes-local-shell/runtime/token)" pnpm run dev:desktop

# Or run both adapter and browser dev with an explicit dev token
HERMES_STUDIO_ADAPTER_TOKEN=dev-token pnpm run dev:adapter
VITE_HERMES_STUDIO_ADAPTER_TOKEN=dev-token pnpm run dev:desktop

# Build frontend (tsc + vite)
pnpm --filter @hermes-desktop-studio/desktop-studio build

# Run checks
pnpm run check:types
source .venv/bin/activate && pnpm run check:python
```

### Adapter Auth

Protected `/studio/*` endpoints require `Authorization: Bearer <token>`. The adapter writes an ephemeral token to `~/.hermes-local-shell/runtime/token` with `0600` permissions at startup.

The Tauri desktop app reads the token through a Rust command and keeps it in memory only. The frontend does not store the token in `localStorage`. Browser dev must either set `VITE_HERMES_STUDIO_ADAPTER_TOKEN` explicitly or use the adapter-generated token file as shown above.

### Health Endpoints

The adapter exposes two unauthenticated health endpoints:
- `GET /studio/health` — canonical desktop frontend health endpoint
- `GET /health` — adapter-level health for CLI/dev tooling only

Both report: adapter status, backend mode, Hermes reachability, last error.

### Legacy `/shell/*` Routes

Legacy prototype `/shell/*` routes are disabled by default. They can be mounted for reference only with:

```bash
HERMES_STUDIO_ENABLE_LEGACY_SHELL_ROUTES=1 pnpm run dev:adapter
```

Desktop frontend code must not call `/shell/*`.

### Protocol Guarantees

- OpenAPI lives in `packages/protocol/openapi.yaml`; tests fail if implemented `/studio/*` routes are missing from it.
- Studio SSE events match `packages/protocol/events.schema.json` and always include `id`, `type`, `timestamp`, `source`, and `payload`.
- Errors use `{ "error": { "code", "message", "retryable", "source", "hint" } }`.

### Studio-owned Storage

Hermes Desktop Studio owns a local SQLite database named `studio.db` for Studio preferences, Kanban workflow metadata, and local-only features. It is separate from Hermes Agent `state.db` and must not store secrets.

Path priority:
- `HERMES_STUDIO_HOME`
- Platform user data directory for `hermes-desktop-studio`
- Linux fallback: `~/.local/share/hermes-desktop-studio/`

`GET /studio/health`, root `GET /health`, and `GET /studio/bootstrap` report storage diagnostics. See [docs/STUDIO_STORAGE.md](docs/STUDIO_STORAGE.md).

### Studio-owned Kanban Backend

Persistent Kanban data uses the same Studio-owned `studio.db`, never Hermes `state.db`. Phase 6C adds `/studio/kanban/*` backend endpoints, default board creation, default columns, and event/schema coverage. Full Kanban UI and drag-and-drop are intentionally later work. See [docs/STUDIO_KANBAN.md](docs/STUDIO_KANBAN.md).

### Backend Modes

The adapter supports three backend modes:

| Mode | Behavior |
|------|----------|
| `mock` | Fake in-memory data. No real Hermes needed. |
| `hermes` | Real Hermes API. Fails if Hermes is unreachable. |
| `auto` | Tries Hermes first, falls back to mock if unavailable. (default) |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HERMES_STUDIO_BACKEND` | `auto` | Backend mode: `mock`, `hermes`, or `auto` |
| `HERMES_API_BASE_URL` | `http://127.0.0.1:8642` | Hermes Agent API URL |
| `HERMES_API_KEY` | *(none)* | Optional API key for Hermes |
| `HERMES_STUDIO_ADAPTER_TOKEN` | *(generated)* | Explicit local adapter auth token for dev |
| `HERMES_STUDIO_ENABLE_LEGACY_SHELL_ROUTES` | `0` | Set `1` only to mount legacy prototype `/shell/*` routes |
| `HERMES_STUDIO_HOME` | platform user data dir | Studio-owned data directory for `studio.db` |
| `HERMES_STUDIO_DB_PATH` | *(none)* | Optional direct path to a file named `studio.db`; guarded against Hermes `state.db` |

The local Hermes runtime contract has been validated against Hermes Agent v0.12.0. See [docs/HERMES_RUNTIME_COMPATIBILITY.md](docs/HERMES_RUNTIME_COMPATIBILITY.md) for the discovered API server command, endpoint shapes, SSE event shapes, and read-only local storage audit.

## Development Status

See [docs/ROADMAP.md](docs/ROADMAP.md) for the current phase and milestone plan.

## License

MIT
