# Reference Review: hermes-desktop

> **This is a reference review, not a competitor analysis.** Hermes Desktop Studio is a personal, local-first, themeable, moddable desktop studio. [hermes-desktop](https://github.com/fathah/hermes-desktop) is a useful existing project that solves related problems with different tradeoffs.

## 1. What hermes-desktop Appears to Solve

hermes-desktop is a comprehensive Electron + React + TypeScript GUI for Hermes Agent. It covers the full lifecycle:

| Area | What it does |
|------|-------------|
| **First-run install** | 7-step guided installation with dependency resolution (Git, uv, Python 3.11+) |
| **Provider configuration** | Grid-based provider selection (OpenRouter, Anthropic, OpenAI, Google, xAI, Nous, Local/Custom) with API key entry |
| **Streaming chat** | SSE over `POST /v1/chat/completions`, real-time delta rendering, tool progress chips, approval/deny buttons, model picker, fast mode toggle |
| **Sessions** | SQLite FTS5 full-text search, date-grouped listing, session resume, cached titles |
| **Profiles (Agents)** | Create, delete, clone, switch profiles with model/provider/skill/gateway status |
| **Memory** | View/edit/add/remove memory entries, user profile memory, stats |
| **Skills** | Browse bundled skills, install/uninstall |
| **Tools** | Enable/disable 14 toolsets |
| **Scheduling** | Cron job builder with 15 delivery targets |
| **Gateways** | 16 messaging platform configurations (Telegram, Discord, Slack, WhatsApp, Signal, Matrix, etc.) |
| **Settings** | Engine info, connection mode, theme, language, network, backup, log viewer |
| **Packaging** | electron-builder: DMG, AppImage, deb, rpm, NSIS exe, auto-update via GitHub Releases |

### Tech Stack

| Layer | hermes-desktop | Hermes Desktop Studio |
|-------|---------------|-------------------|
| Shell | Electron 39 | **Tauri v2** |
| UI | React 19 + TypeScript | **React + TypeScript + Vite** |
| Styling | Tailwind CSS 4 + CSS variables | **CSS variables (theme packs)** |
| State | React useState + props drilling | **Zustand** |
| DB | better-sqlite3 (session cache) | Read-only via adapter |
| i18n | i18next (4 locales) | Future |
| Testing | Vitest | Vitest (planned) |
| Packaging | electron-builder | **Tauri native installers** |

## 2. Useful Lessons for Hermes Desktop Studio

### Setup Flow Ideas

- **Guided install wizard** with dependency checking is valuable for first-run UX. hermes-desktop's 7-step approach is thorough but may be overbuilt for local-first users who likely already have Hermes installed.
- **Provider grid** with preset buttons (LM Studio, Ollama, vLLM) is a good UX pattern. We can adapt this as a setup screen within the studio, but it should not be the first thing users see — the workbench should be.
- **Remote connection option** (URL + API key) is useful but should not be our primary flow. Local-first means the default path is "adapter finds local Hermes automatically."

### Chat Streaming UX Ideas

- **Typing indicator** (bouncing dots) while waiting for first SSE chunk — simple and effective.
- **Tool progress chips** inline during streaming — we should do this via our `tool.started`/`tool.progress`/`tool.completed` events.
- **Model picker dropdown** at the bottom of chat is an accessible placement.
- **Approval/deny buttons** auto-detected on dangerous tool actions — critical for safety.
- **Desktop notifications** when window is unfocused and response takes >10s — good UX detail.
- **Extracted SSE parser** as a standalone testable module — excellent pattern. Our adapter already does this with `event_normalizer.py`, but the frontend should also have a clean SSE parsing layer.

### Settings Organization Ideas

- **Collapsible sections** in a single scrollable page is a workable pattern for settings.
- **Dedicated provider screen** with grouped API keys is better than mixing providers into general settings.
- **Log viewer** with file selector is practical and easy to implement.

### Session Browser Ideas

- **Date grouping** (Today/Yesterday/This Week/Earlier) is a natural mental model.
- **FTS5 full-text search** with snippet highlighting is powerful. Our adapter already plans read-only `state.db` access — we should support this.
- **Session cache layer** for fast listing without hitting DB on every render.

### Packaging Lessons

- **Per-platform CI matrix** (macOS, Linux, Windows) is necessary for desktop apps. hermes-desktop uses GitHub Actions with separate jobs per platform.
- **Auto-update** from GitHub Releases is standard for desktop apps. Tauri has built-in updater support.
- **Not code-signed** — this is a pain point. Code signing should be planned but not blocking MVP.

### What Not to Overbuild Early

- **Gateway management** (16 platforms) — this is Hermes core territory. Our studio should show gateway status, not manage gateway lifecycle.
- **Cron scheduling UI** — complex, niche. Can be a future tab.
- **3D visual interface** (Claw3D Office) — out of scope.
- **Installation wizard** — local-first users likely have Hermes. A health check + setup hint is enough for MVP.
- **Credential pool with rotation** — nice but not MVP.
- **80+ IPC handlers** — hermes-desktop has ~80 typed IPC methods. Our adapter HTTP API is simpler and more maintainable. We should not replicate this IPC surface.

## 3. What Hermes Desktop Studio Keeps Different

| Dimension | hermes-desktop | Hermes Desktop Studio |
|-----------|---------------|-------------------|
| **Desktop framework** | Electron (~150MB bundle) | **Tauri v2 (~10MB bundle)** |
| **Primary focus** | Broad control panel for all Hermes features | **Local-first personal studio** |
| **Theme system** | Light/dark/system CSS variables | **Generic concept packs** (Minecraft, Minions, LOTR, Cyberpunk, etc.) |
| **Layout** | Fixed sidebar + single content area | **Dockable workbench** (dockview, VS Code-like) |
| **Kanban** | Not present | **First-class core surface** |
| **Plugin architecture** | None | **Manifest-based plugin system** (theme-pack, layout-pack, panel-pack, command-pack, kanban-pack) |
| **State management** | useState + props drilling (already straining at 13 screens) | **Zustand** (scalable, testable) |
| **API contract** | Direct Hermes API + 80 IPC handlers | **Stable adapter contract** (`/studio/*` endpoints, 50+ endpoints) |
| **Session access** | Direct better-sqlite3 in Electron main | **Read-only via adapter** |
| **Event system** | Hermes SSE → IPC events | **Normalized 15-event system** (adapter synthesizes missing events) |
| **i18n** | 4 locales, 80 translation files | Future |
| **Persona** | Administration/control panel feel | **Personal studio/workbench feel** |

## 4. Roadmap Impact

### Phase 2 proceeds unchanged

Phase 2 should still build the Tauri + React skeleton with our planned layout:
- Left sidebar (profiles, sessions, search)
- Center tabs (chat, kanban, artifacts)
- Right sidebar (model, tools, memory, inspector)
- Bottom panel (activity, logs)
- Command palette (Ctrl+K)
- Theme switcher

### Do not duplicate every hermes-desktop screen

hermes-desktop has 13+ screens. Our MVP should focus on:

1. **Workbench layout** — dockable panels, the core differentiator
2. **Theme engine** — concept packs, CSS variables, live switching
3. **Chat surface** — streaming transcript via adapter events
4. **Kanban placeholder** — board/column structure, mock data
5. **Command palette** — Ctrl+K, extensible
6. **Adapter connection** — real `/studio/*` contract

### Learn from hermes-desktop later

These can be added post-MVP, informed by hermes-desktop patterns:
- Setup/provider configuration flow
- Session browser with FTS5 search
- Memory viewer
- Skills/tools management
- Settings organization
- Log viewer
- Desktop notifications

## 5. Explicit Non-Goals

- **No code copying.** This is a reference review only.
- **No Electron migration.** Our stack is Tauri v2.
- **No remote-first UX.** Our primary user is local.
- **No hardcoded concept themes.** Our theme system is generic and semantic-slot-based.
- **No attempt to clone hermes-desktop feature-for-feature.** Our product direction is a local-first, themeable, moddable studio — not a comprehensive Hermes administration panel.
- **No gateway management.** We show status, not lifecycle.
- **No installation wizard.** Health check + hint is sufficient for MVP.
