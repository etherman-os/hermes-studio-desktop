# Roadmap

## Phase 0 — Repo Reorganization (Done)

- [x] Move Textual TUI prototype to `legacy/textual-prototype/`
- [x] Create `apps/desktop-studio/` placeholder
- [x] Add `pnpm-workspace.yaml` and root `package.json`
- [x] Update README, ARCHITECTURE, ROADMAP for desktop-first direction
- [x] Add `docs/PRODUCT_DIRECTION.md` and `docs/ADR-0001-desktop-first.md`
- [x] Add placeholder theme packs (example-minions, example-lotr)

## Phase 1 — Protocol and Schemas

- [ ] `packages/protocol/openapi.yaml` — Adapter API specification (all `/shell/*` endpoints)
- [ ] `packages/protocol/events.schema.json` — Normalized event types (15 events)
- [ ] `packages/protocol/theme.schema.json` — Theme pack TOML schema
- [ ] `packages/protocol/layout.schema.json` — Layout pack TOML schema
- [ ] `packages/shared-types/src/index.ts` — TypeScript type definitions

## Phase 2 — Desktop Studio Skeleton

- [ ] Tauri v2 + React + TypeScript + Vite project initialization
- [ ] Main layout: left sidebar / center tabs / right sidebar / bottom panel
- [ ] CSS variable theming from concept pack data
- [ ] Theme switcher placeholder (default-dark ↔ minecraft-overworld)
- [ ] Keyboard shortcuts (Ctrl+K, Ctrl+Enter, Ctrl+1/2/3, Esc)
- [ ] Zustand stores (theme, session, run, profile)
- [ ] Command palette placeholder

## Phase 3 — Fake Adapter + UI Integration

- [ ] SSE mock streaming (assistant.delta, tool.started, tool.completed, approval.requested)
- [ ] Chat tab: streaming transcript, user/assistant messages, tool chips
- [ ] Kanban tab: mock board with 5 columns (triage, ready, doing, blocked, done)
- [ ] Approval modal
- [ ] Session sidebar

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
