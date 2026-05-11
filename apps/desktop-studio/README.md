# Hermes Desktop Studio

A local-first, themeable desktop studio for [Hermes Agent](https://github.com/NousResearch/hermes-agent).

![Hermes Desktop Studio — run-centered desktop workbench](./docs/screenshots/hero.png)

## What is this?

Hermes Desktop Studio is a native desktop application that provides a polished interface for working with Hermes Agent. It combines a run-centered workbench, session management, profile handling, and theming into a single desktop app.

## Key Features

- **Native Desktop App** — Built with Tauri for fast, native performance on Linux, macOS, and Windows
- **Run-Centered Workbench** — Track and revisit all your Hermes Agent sessions in one place
- **Theme System** — Fully customizable look and feel with semantic token-based theming
- **Local-First** — All data stays on your machine; connects to Hermes Agent via local adapter
- **Model Viewer** — Browse and manage your configured AI model providers
- **Session Management** — Full history of conversations with search and filtering
- **Profile System** — Switch between different configuration profiles

## Quick Start

```bash
# Clone and install
git clone https://github.com/NousResearch/hermes-shell.git
cd hermes-shell
pnpm install

# Run the desktop app
cd apps/desktop-studio
pnpm tauri dev
```

For detailed installation instructions, see [INSTALL.md](./INSTALL.md).

## Documentation

- [Installation Guide](./INSTALL.md) — Step-by-step setup for all platforms
- [First-Time Setup](./SETUP.md) — Configure models, skills, and MCP servers
- [Architecture Overview](#architecture) — How the pieces fit together
- [Theme System](#theme-system) — Customizing the look and feel

## Stack

- **Tauri v2** — Desktop app framework (Rust host)
- **React 19** — UI framework
- **TypeScript** — Type-safe frontend
- **Vite 6** — Build tool and dev server
- **Zustand** — Client state management
- **CSS variables** — Theme tokens

## Development

```bash
# Install dependencies
pnpm install

# Start frontend dev server only
pnpm dev

# Start Tauri desktop app
pnpm tauri dev

# Build frontend
pnpm build

# Build Tauri desktop app
pnpm tauri build

# Run tests
pnpm test:e2e

# Visual smoke test (optional QA helper)
pnpm test:visual
```

### Troubleshooting

**First run is slow?** — Tauri compiles Rust dependencies on first run; subsequent runs are much faster.

**Port already in use?** — Something else is using port 1420:
```bash
lsof -ti:1420 | xargs kill -9
```

**Rust errors?** — Update your toolchain:
```bash
rustup update
cd src-tauri && cargo clean
```

## Architecture

```
┌─────────────────────────────────────────────┐
│ Desktop Studio (Tauri v2 + React + TS)      │
│  App Frame / Sidebar / Workbench / Panels   │
└──────────────────────┬──────────────────────┘
                       │ HTTP/SSE (local only)
┌──────────────────────▼──────────────────────┐
│ Local Shell Adapter (Python)                │
│  FastAPI on 127.0.0.1:39191                 │
└──────────────────────┬──────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   Hermes API     Hermes CLI    Local State
   /v1/runs       config/set    ~/.hermes/state.db
   SSE stream     sessions      ~/.hermes/logs
```

## Theme System

Hermes Desktop Studio uses a generic, semantic-slot-based theme system.
No concept (Minecraft, Minions, LOTR, etc.) is hardcoded.

Theme packs can override: colors, icons, labels, panel names, typography,
empty states, onboarding copy, kanban styling, density, and decorative assets.

The core app uses stable semantic keys: `profiles`, `sessions`, `chat`,
`kanban`, `artifacts`, `tools`, `memory`, `logs`, `activity`, `inspector`,
`command_palette`, `settings`, `theme_gallery`.

### Creating a Theme

1. Duplicate an existing theme in `src/styles/themes/`
2. Override the CSS variables you want to change
3. Add your theme name to the theme gallery

## Screenshots

<!-- Screenshot placeholders — replace with actual images -->

**Main workbench:**
![Main workbench](./docs/screenshots/workbench.png)

**Session panel:**
![Session panel](./docs/screenshots/sessions.png)

**Theme gallery:**
![Theme gallery](./docs/screenshots/themes.png)

## Status

UX-1 foundation — run-centered desktop workbench shell with adapter-backed sessions, logs, profiles, model viewer, theme loading, and current-session Run Ledger. Tauri is the product runtime; browser smoke tests are optional QA helpers.

## Links

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — The agent this studio connects to
- [Hermes Shell Repository](https://github.com/NousResearch/hermes-shell) — This project
- [Documentation](https://hermes-agent.nousresearch.com/docs) — Full documentation