# Roadmap

## Phase 0 — Repo Reorganization (Done)

- [x] Move Textual TUI prototype to `legacy/textual-prototype/`
- [x] Create `apps/desktop-studio/` placeholder
- [x] Add `pnpm-workspace.yaml` and root `package.json`
- [x] Update README, ARCHITECTURE, ROADMAP for desktop-first direction
- [x] Add `docs/PRODUCT_DIRECTION.md` and `docs/ADR-0001-desktop-first.md`
- [x] Add placeholder theme packs (example-minions, example-lotr)

## Phase 1 — Protocol and Schemas (Done)

- [x] `packages/protocol/openapi.yaml` — Adapter API specification (16 `/studio/*` endpoints)
- [x] `packages/protocol/events.schema.json` — Normalized event types (15 events)
- [x] `packages/protocol/theme.schema.json` — Theme pack TOML schema
- [x] `packages/protocol/layout.schema.json` — Layout pack TOML schema
- [x] `packages/protocol/plugin.schema.json` — Plugin manifest schema
- [x] `packages/shared-types/src/` — TypeScript type definitions (events, theme, layout, plugin)

## Phase 2 — Desktop Studio Skeleton (Done)

- [x] Tauri v2 + React + TypeScript + Vite project initialization
- [x] Main layout: left activity rail / left sidebar / center tabs / right panel / bottom panel / status bar
- [x] CSS variable theming from concept pack data
- [x] Theme switcher (5 themes: default-dark, minecraft-overworld, example-minions, example-lotr, minimal-light)
- [x] Keyboard shortcuts (Ctrl+K command palette)
- [x] Zustand stores (theme, layout, session, run, ui)
- [x] Command palette with sample commands and keyboard navigation
- [x] Chat placeholder with mock messages and tool chips
- [x] Kanban placeholder with 5 columns and 8 mock cards
- [x] Right inspector panel (model, tools, memory)
- [x] Bottom activity/log panel with mock data
- [x] Status bar with profile, path, model, theme info

## Phase 3 — Fake Adapter + UI Integration (Done)

- [x] Adapter: `/studio/*` endpoints (16 endpoints, fake in-memory data)
- [x] Adapter: Fake run with SSE event sequence (run.started → delta → tool → completed)
- [x] Adapter: Stop run (run.cancelled event)
- [x] Adapter: Logs stream (fake log.line events every 1.5s)
- [x] Adapter: Themes, config, profiles, sessions endpoints
- [x] Desktop: studioClient.ts (typed API client + SSE parser)
- [x] Desktop: adapterStore (connection status)
- [x] Desktop: runStore (send prompt, consume SSE, stop)
- [x] Desktop: sessionStore (load from adapter)
- [x] Desktop: ChatSurface (real streaming, stop button, tool chips)
- [x] Desktop: StatusBar (adapter connection indicator)
- [x] Root dev scripts (dev:adapter, dev:desktop)

## Phase 3.5 — Stabilization and Contract Alignment (Done)

- [x] Health endpoint alignment: both `/health` and `/studio/health` exist
- [x] OpenAPI audit: duplicate `/studio/config` fixed, paths aligned with implementation
- [x] SSE robustness: clean cancellation, unknown event tolerance, disconnect handling
- [x] Frontend fallback: adapter unavailable shows warning, composer has visual indicator
- [x] QA checklist: `docs/QA_CHECKLIST.md` with 40+ manual smoke test items
- [x] Adapter tests: 17 new tests for `/studio/*` endpoints (52 total passing)
- [x] Dev commands documented: `dev:adapter`, `dev:desktop`, `build`

## Phase 4 — Real Hermes Integration

- [ ] Hermes API client (`/v1/capabilities`, `/v1/runs`, SSE, `/stop`)
- [ ] Event normalizer (defensive: synthesize `run.failed`, `tool.completed`)
- [ ] Session browser (`state.db` read-only queries)
- [ ] Logs panel (live tail)
- [ ] Config UI (`hermes config` CLI wrapper)
- [ ] Kanban layer (CLI wrappers for board/task operations)

## Phase 5 — Polish and Accessibility

- [ ] Keyboard navigation (full keyboard usability)
- [ ] High-contrast mode
- [ ] Reduced motion support
- [ ] Font scale support
- [ ] Error states and retry flows
- [ ] Approval UX refinement

## Phase 6 — Packaging and Release

- [ ] Tauri native installers (Linux, macOS)
- [ ] Auto-update mechanism
- [ ] GitHub Releases pipeline
- [ ] Documentation for users

## Reference Projects

- **[hermes-desktop](https://github.com/fathah/hermes-desktop)** — Electron + React + TypeScript desktop GUI for Hermes Agent. Useful reference for Hermes desktop UX patterns (setup flow, chat streaming, session browsing, settings organization, packaging). Hermes Local Studio remains a local-first, themeable, moddable Tauri studio with a different product direction. See `docs/REFERENCE_HERMES_DESKTOP.md` for the full reference review.
