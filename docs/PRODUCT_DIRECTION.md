# Product direction

## Product vision

Hermes Desktop Studio is a local-first, themeable desktop workbench for [Hermes Agent](https://github.com/NousResearch/hermes-agent). It is designed for users who run Hermes on their own machine and want a comfortable, VS Code/Warp-like daily interface — not a terminal-only experience.

## Why not terminal TUI?

The first prototype was a Textual-based terminal TUI. It was valuable for research and validation, but terminal UIs have inherent ceilings. Visual ergonomics in terminals cannot match desktop apps in layout flexibility, font rendering, or interactive panels. Dockable panels require free-form panel docking, drag-and-drop, and resizable sections that terminal cells cannot provide. Rich theming in desktop apps supports full CSS-driven theming with variables, transitions, and accessibility features, while terminal theming is limited to 16 colors and box-drawing characters. Accessibility features like screen readers, high-contrast modes, reduced motion, and font scaling are first-class in desktop apps and all limited in terminals.

The Textual prototype was the right choice for rapid validation. But it is not the final product.

## Why Tauri v2?

Tauri v2 was chosen because it produces a small binary using the system webview with no bundled Chromium, provides secure IPC through a Rust host that offers sandboxed communication between frontend and system, supports cross-platform development for Linux, macOS, and Windows from a single codebase, allows any frontend choice (React, Svelte, Vue) — the project chose React, and produces native installers (MSI, DMG, AppImage, deb).

## Why React (not SvelteKit)?

This project is not a simple chat UI. It is a dockable desktop workbench comparable to VS Code or Warp. The React ecosystem provides `dockview` for a dockable panel system (VS Code-like layout engine), Monaco Editor for code and artifact viewing, `@dnd-kit` for drag and drop, `@tanstack/react-query` for server state management, and `zustand` for lightweight client state management.

SvelteKit is a fine framework, but for this scale of desktop workbench, React's ecosystem and component library coverage are more appropriate.

## What is a concept pack?

A concept pack is a complete visual and linguistic re-skin of the application. It is not just a color theme. A concept pack can override colors and palette, icons and glyphs, labels, panel names, and terminology, layout defaults (panel widths, visibility, density), card and kanban column styles, command palette labels, empty state messages, onboarding copy, and optional decorative assets like banners and illustrations.

### Semantic slot system

The core application uses stable semantic keys for all UI concepts:

| Semantic key | Default label | Minecraft | LOTR | Minions |
|-------------|---------------|-----------|------|---------|
| `profiles` | Profiles | Worlds | Realms | Villains |
| `sessions` | Sessions | Ender Chest | Journeys | Missions |
| `chat` | Chat | Crafting Table | Council | Briefing Room |
| `kanban` | Kanban | Task Board | Quest Board | Master Plan |
| `tools` | Tools | Inventory | Artifacts | Gadgets |
| `memory` | Memory | Chest | Archives | Vault |
| `logs` | Logs | Server Logs | Palantir | Surveillance |
| `activity` | Activity | Redstone | Beacon | Henchmen |
| `inspector` | Inspector | Observer | Scrying | Scanner |
| `command_palette` | Command Palette | Command Block | Spellbook | Blueprint |

No concept is hardcoded into the core application. The mapping is data-driven and loaded from theme/layout TOML files.

### Examples are examples

Minecraft Overworld is an example concept pack — it demonstrates the system. The product must support arbitrary concept packs: Minions, Lord of the Rings, Cyberpunk, Minimal, Anime, or anything users create.

## Hermes integration boundaries

Studio does not touch Hermes core code (no forking, vendoring, or modification), the `tui_gateway` internal IPC surface which is not a stable API, the dashboard plugin router which is changing and not reliable for production, or the internal Python runtime which is a private implementation detail.

Studio uses Hermes API Server endpoints (`POST /v1/runs`, `GET /v1/runs/{id}/events` for SSE, `POST /v1/runs/{id}/stop`, `GET /v1/capabilities`, `GET /health`), Hermes CLI wrappers (`hermes config`, `hermes profile`, `hermes model`, `hermes auth`, `hermes logs` when those commands provide a safe official path), read-only local state (`state.db` SQLite, `sessions/` JSONL transcripts, `logs/`, `config.yaml`, `~/.hermes/skins/`), and Studio-owned workflow state (Kanban persistence belongs to Hermes Desktop Studio unless Hermes exposes an explicit safe official workflow API later).

## Adapter philosophy

The Python adapter is the source of truth for the API contract. The desktop shell never talks to Hermes directly — it talks to the adapter. This separation means the frontend can change without affecting Hermes integration, the adapter contract changes slowly and deliberately, Hermes upgrades are handled defensively in the adapter rather than the UI, and event normalization hides Hermes-specific quirks like missing `run.failed` events.