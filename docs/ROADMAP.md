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

- [x] Health endpoint alignment: `/studio/health` exists for Studio, root `/health` exists for adapter/dev tooling
- [x] OpenAPI audit: duplicate `/studio/config` fixed, paths aligned with implementation
- [x] SSE robustness: clean cancellation, unknown event tolerance, disconnect handling
- [x] Frontend fallback: adapter unavailable shows warning, composer has visual indicator
- [x] QA checklist: `docs/QA_CHECKLIST.md` with 40+ manual smoke test items
- [x] Adapter tests: 17 new tests for `/studio/*` endpoints (52 total passing)
- [x] Dev commands documented: `dev:adapter`, `dev:desktop`, `build`

## Phase 4A — Real Hermes Chat Bridge (Done)

- [x] Backend abstraction: `StudioBackend` base class, `MockBackend`, `HermesBackend`
- [x] Backend config: env vars `HERMES_STUDIO_BACKEND` (mock/hermes/auto), `HERMES_API_BASE_URL`, `HERMES_API_KEY`
- [x] Backend factory: auto mode tries Hermes, falls back to mock
- [x] HermesBackend: health, bootstrap, start_run, stream_run_events (SSE proxy), stop_run
- [x] Event normalization: Hermes SSE → Studio events (OpenAI delta, tool, approval, run lifecycle)
- [x] studio_routes.py: delegates to backend abstraction layer
- [x] Health endpoints: report backend mode, Hermes reachability, last error
- [x] Frontend: StatusBar shows backend mode (Mock/Hermes/Auto)
- [x] Tests: 16 new tests (event normalization, HermesBackend, auto fallback) — 68 total passing
- [x] Frontend build: tsc + vite pass

## Phase 4A.5 — Hermes Bridge Hardening (Done)

- [x] Smoke test docs: `docs/REAL_HERMES_SMOKE_TEST.md` with manual test checklist
- [x] Debug mode: `HERMES_STUDIO_DEBUG_EVENTS=1` logs raw/normalized events with redaction
- [x] Fixture capture: `scripts/capture_hermes_sse.py` for manual SSE capture
- [x] Fixture replay test: `tests/fixtures/hermes_sse_sample.jsonl` + replay tests
- [x] Error hardening: clear messages for Hermes unreachable, auto fallback, hermes mode failures
- [x] Tests: 72 total passing (4 new fixture replay tests)

## Phase 4B — Read-only Hermes Sessions (Done)

- [x] session_repository.py: Hermes home bulma, state.db read-only, schema detection
- [x] Defensive schema detection: tables, columns, FTS, graceful fallback
- [x] HermesBackend: list_sessions, get_session, search_sessions from real DB
- [x] Bootstrap response includes session_source info
- [x] Frontend: sessionStore loads from adapter with source tracking
- [x] Left sidebar: adapter-loaded sessions with message count
- [x] Sessions center tab: session list, detail view, transcript preview, search filter
- [x] Session detail: metadata + transcript preview from adapter
- [x] assistant.delta payload verified: text field present in all normalization paths
- [x] docs/HERMES_STATE_READONLY.md: read-only guarantee, env vars, troubleshooting
- [x] Tests: 18 new tests (fixture DB, FTS, read-only verification) — 92 total passing

## Phase 4B.5 — Session UX Completion (Done)

- [x] SessionsPanel: adapter-loaded sessions, detail view, search, empty state
- [x] assistant.delta payload verified: text field in all 4 normalization paths
- [x] Build: tsc + vite pass

## Phase 4C — Real Hermes Logs + Profiles (Done)

- [x] log_repository.py: logs dizini bulma, okuma, redaction, tail
- [x] profile_repository.py: profil keşfi, metadata, active profil tespiti
- [x] HermesBackend: list_profiles, get_active_profile, get_logs, stream_logs
- [x] /studio/profiles, /studio/profiles/active, /studio/profiles/activate (501)
- [x] /studio/logs: source ve tail query params
- [x] /studio/logs/stream: source param
- [x] Bootstrap: profiles_available, profile_count, logs_available, log_sources
- [x] Health: logs ve profiles status
- [x] Log redaction: bearer, api_key, hex, key prefixes
- [x] Tests: 19 new (log repo, profile repo, redaction) — 111 total passing
- [x] docs/HERMES_LOGS_AND_PROFILES.md

## Phase 4C.5 — Profiles + Logs UI Completion (Done)

- [x] profileStore: load profiles/active, activate with 501 handling
- [x] logStore: load recent, stream, source selector, level parsing
- [x] Left sidebar: real profiles with activate + error display
- [x] StatusBar: active profile name from store
- [x] Bottom panel: real logs with source selector, stream, refresh, clear
- [x] Log lines: level-colored (info/warn/error)
- [x] AppFrame: loads profiles + logs on startup
- [x] studioClient: getActiveProfile, activateProfile, getLogs(source, tail)
- [x] Build: tsc + vite pass, 111 adapter tests passing

## Phase 4D — Model/Provider Config Viewer (Done)

- [x] config_repository.py: config.yaml + .env okuma, redaction, secret detection
- [x] Backend: get_model_config(), get_provider_status()
- [x] /studio/model-config endpoint
- [x] Bootstrap: model_config metadata
- [x] Frontend: RightPanel Model section wired to adapter
- [x] Model panel: provider, model, api key status, context, warnings
- [x] Command palette: Refresh Model Config, Show Provider Status
- [x] Tests: 14 new (config repository) — 125 total passing
- [x] docs/HERMES_MODEL_PROVIDER_VIEWER.md

## Phase 5 — Real Theme Concept Pack Loader (Done)

- [x] theme_repository.py: TOML discovery, validation, inheritance, activate, reload
- [x] Built-in themes: default-dark, minimal-light, minecraft-overworld, example-minions, example-lotr
- [x] Theme TOML files updated with full semantic slot labels
- [x] Backend: list_themes, get_theme, get_active_theme, activate_theme, reload_themes
- [x] /studio/themes, /studio/themes/{id}, /studio/themes/active, /studio/themes/activate, /studio/themes/reload
- [x] HermesBackend + MockBackend: both use theme repository
- [x] Frontend: themeStore loads from adapter, activateTheme via API
- [x] Theme Gallery: adapter themes, source info, validity, reload button
- [x] Activation persists in ~/.config/hermes-desktop-studio/config.json
- [x] Tests: 20 new (theme repository) — 145 total passing
- [x] docs/THEME_PACKS.md: format, semantic slots, inheritance, search paths, creating custom themes

## Phase 5.5 — Theme UI Integration and Route QA (Done)

- [x] Route ordering QA: /themes/active, /themes/reload not captured by {theme_id}
- [x] MockBackend: get_theme/get_active_theme return normalized format (meta wrapper)
- [x] Route tests: active, reload, get by id, not found, route ordering
- [x] Tests: 5 new route tests — 150 total passing
- [x] Build: tsc + vite pass

## Phase 5.6 — Theme Frontend Integration (Done)

- [x] themeStore: adapter themes as primary, local fixtures as fallback
- [x] loadThemes(): loads all adapter themes + active theme, merges with fallback
- [x] activateTheme(): POST /themes/activate + get normalized + apply CSS
- [x] reloadThemes(): POST /themes/reload + reload all
- [x] AppFrame: calls loadThemes after authenticated adapter connection; local fallback remains available offline
- [x] Theme Gallery: author, version, source, validity, warnings, active indicator
- [x] Theme Gallery: loading state, error state, empty state, reload button
- [x] TS fixtures: marked as fallback-only with clear comments
- [x] Semantic labels/icons: all components use label()/icon() from theme store
- [x] Build: tsc + vite pass, 150 adapter tests passing

## Phase 5.7 — Studio Protocol Hardening Before Kanban (Done)

- [x] Tauri auth bootstrap: desktop reads adapter token through Rust command bridge, browser dev uses explicit Vite env token
- [x] Protected `/studio/*` calls fail clearly when token is unavailable; token is not stored in `localStorage`
- [x] Canonical frontend health endpoint is `/studio/health`; root `/health` remains adapter/dev tooling health only
- [x] Legacy `/shell/*` routes disabled by default; opt-in with `HERMES_STUDIO_ENABLE_LEGACY_SHELL_ROUTES=1`
- [x] Standard error envelope across backend and frontend parser
- [x] Studio event envelope guaranteed: `id`, `type`, `timestamp`, `source`, `payload`, optional `run_id`/`session_id`
- [x] MockBackend and HermesBackend SSE events validate against `events.schema.json`
- [x] OpenAPI route parity test covers implemented `/studio/*` paths
- [x] Tauri CSP set to a restrictive local-app policy
- [x] Python lint/type baseline clean: ruff and mypy pass
- [x] Shared types package has a local TypeScript dev dependency and typechecks
- [x] Tests/build: adapter tests, frontend API tests, frontend build, and Tauri cargo check pass

## Later — Polish and Accessibility

- [ ] Keyboard navigation (full keyboard usability)
- [ ] High-contrast mode
- [ ] Reduced motion support
- [ ] Font scale support
- [ ] Error states and retry flows
- [ ] Approval UX refinement

## Phase 6 — Persistent Studio-owned Kanban Workflow

- [x] Phase 6B foundation: Studio-owned `studio.db` location resolution, migrations, metadata, health/bootstrap status
- [x] Storage safety: no Hermes `state.db` writes, no secrets, guard against `HERMES_STUDIO_DB_PATH` pointing at Hermes state
- [x] docs/STUDIO_STORAGE.md
- [x] Phase 6C backend protocol: persistent Studio-owned Kanban repository, default board, and default columns
- [x] Define Studio-owned Kanban persistence schema outside Hermes core/state.db
- [x] Add `/studio/kanban/*` protocol paths and OpenAPI coverage before frontend wiring
- [x] Implement adapter persistence with local Studio storage and migration/version metadata
- [x] Add tests for CRUD, ordering, migration, event normalization, and read-only Hermes guarantees
- [ ] Keep theme/concept pack Kanban presentation generic and semantic-slot driven
- [ ] Wire frontend Kanban store/components to `/studio/*` only

## Phase 6C.5 — Real Local Hermes Discovery and Integration Audit (Done)

- [x] Verified installed Hermes CLI and gateway API server surface against `Hermes Agent v0.12.0`
- [x] Documented official local API server start path: `API_SERVER_ENABLED=true hermes gateway --accept-hooks run`
- [x] Fixed HermesBackend run payload, capabilities parsing, SSE event parsing, stop status handling, and Hermes error message extraction
- [x] Added sanitized runtime compatibility fixtures and schema replay tests
- [x] Confirmed local Hermes `state.db`, logs, config, and `.env` assumptions read-only without storing secrets

## Phase 7 — Packaging and Release

- [ ] Tauri native installers (Linux, macOS)
- [ ] Auto-update mechanism
- [ ] GitHub Releases pipeline
- [ ] Documentation for users

## Reference Projects

- **[hermes-desktop](https://github.com/fathah/hermes-desktop)** — Electron + React + TypeScript desktop GUI for Hermes Agent. Useful reference for Hermes desktop UX patterns (setup flow, chat streaming, session browsing, settings organization, packaging). Hermes Local Studio remains a local-first, themeable, moddable Tauri studio with a different product direction. See `docs/REFERENCE_HERMES_DESKTOP.md` for the full reference review.
