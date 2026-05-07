# Product Direction

## Product Vision

Hermes Desktop Studio is a **local-first, themeable desktop workbench** for [Hermes Agent](https://github.com/NousResearch/hermes-agent). It is designed for users who run Hermes on their own machine and want a comfortable, VS Code/Warp-like daily interface — not a terminal-only experience.

## Why Not Terminal TUI?

The first prototype was a Textual-based terminal TUI. It was valuable for research and validation, but terminal UIs have inherent ceilings:

- **Visual ergonomics:** Terminals cannot match desktop apps in layout flexibility, font rendering, or interactive panels.
- **Dockable panels:** A VS Code-like workbench requires free-form panel docking, drag-and-drop, and resizable sections — terminal cells cannot provide this.
- **Rich theming:** Desktop apps support full CSS-driven theming with variables, transitions, and accessibility features. Terminal theming is limited to 16 colors and box-drawing characters.
- **Accessibility:** Screen readers, high-contrast modes, reduced motion, font scaling — all first-class in desktop apps, all limited in terminals.

The Textual prototype was **not a wrong choice** — it was the right choice for rapid validation. But it is not the final product.

## Why Tauri v2?

- **Small binary:** Uses system webview, no bundled Chromium.
- **Secure IPC:** Rust host provides sandboxed communication between frontend and system.
- **Cross-platform:** Linux, macOS, Windows from a single codebase.
- **Any frontend:** React, Svelte, Vue — choose what fits. We chose React.
- **Native installer:** Produces platform-native installers (MSI, DMG, AppImage, deb).

## Why React (Not SvelteKit)?

This project is not a simple chat UI. It is a **dockable desktop workbench** comparable to VS Code or Warp. The React ecosystem provides:

- `dockview` — Dockable panel system (VS Code-like layout engine)
- Monaco Editor — Code and artifact viewing
- `@dnd-kit` — Drag and drop
- `@tanstack/react-query` — Server state management
- `zustand` — Lightweight client state management

SvelteKit is a fine framework, but for this scale of desktop workbench, React's ecosystem and component library coverage are more appropriate.

## What Is a Concept Pack?

A concept pack is a **complete visual and linguistic re-skin** of the application. It is not just a color theme. A concept pack can override:

- Colors and palette
- Icons and glyphs
- Labels, panel names, and terminology
- Layout defaults (panel widths, visibility, density)
- Card and kanban column styles
- Command palette labels
- Empty state messages
- Onboarding copy
- Optional decorative assets (banners, illustrations)

### Semantic Slot System

The core application uses stable **semantic keys** for all UI concepts:

| Semantic Key | Default Label | Minecraft | LOTR | Minions |
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

### Examples Are Examples

Minecraft Overworld is an **example concept pack** — it demonstrates the system. The product must support arbitrary concept packs: Minions, Lord of the Rings, Cyberpunk, Minimal, Anime, or anything users create.

## Hermes Integration Boundaries

### Do Not Touch

- Hermes core code — no forking, no vendoring, no modification
- `tui_gateway` — internal IPC surface, not a stable API
- Dashboard plugin router — changing, not reliable for production
- Internal Python runtime — private implementation detail

### Use These Surfaces

- **Hermes API Server:** `POST /v1/runs`, `GET /v1/runs/{id}/events` (SSE), `POST /v1/runs/{id}/stop`, `GET /v1/capabilities`, `GET /health`
- **Hermes CLI wrappers:** `hermes config`, `hermes profile`, `hermes model`, `hermes auth`, `hermes logs` when those commands provide a safe official path
- **Read-only local state:** `state.db` (SQLite), `sessions/` (JSONL transcripts), `logs/`, `config.yaml`, `~/.hermes/skins/`
- **Studio-owned workflow state:** Kanban persistence belongs to Hermes Desktop Studio unless Hermes exposes an explicit safe official workflow API later.

## Adapter Philosophy

The Python adapter is the **source of truth** for the API contract. The desktop shell never talks to Hermes directly — it talks to the adapter. This separation means:

- Frontend can change (React, or future alternatives) without affecting Hermes integration
- Adapter contract changes slowly and deliberately
- Hermes upgrades are handled defensively in the adapter, not in the UI
- Event normalization hides Hermes-specific quirks (e.g., missing `run.failed` events)
