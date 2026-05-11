# Roadmap

## Current studio layer — Hermes Desktop Production Studio

- Mission Control is the default surface with runtime health, local CLI/gateway bridge actions, recent runs, approvals, delegations, managed processes, and Hermes capability counts
- Local Hermes inventory for providers, models, installed/bundled skills, MCP servers, and toolsets without remote calls
- Provider/model config writes through official `hermes config set` CLI commands, including auto-mode fallback when the gateway is down
- Local CLI backend as the default desktop runtime so local Hermes installs do not require gateway
- Hermes v0.13 local CLI discovery, including `checkpoints`, chat flag support, and checkpoint store status
- Local run presets for implement, review, debug, design polish, browser verification, multi-agent orchestration, Kanban swarm planning, video generation, and Studio memory extraction
- New Run handoff maps Studio options to Hermes CLI flags: provider/model, skills, toolsets, checkpoints, max turns, worktree, and session id
- Hermes Arsenal skill/toolset cards and multi-skill Capability Recipes can prefill a local Hermes run
- Experimental SSH backend mode for VPS Hermes control through remote CLI
- Local CLI run output streams into Studio while gateway/API remains optional for richer structured event telemetry
- Process Cockpit includes Hermes runtime templates for gateway, doctor, tools summary, MCP list, skills check, checkpoints status, and Kanban watch/stats
- Design Canvas imports HTML, screenshot notes, local URLs/file paths, Figma URLs, JSON specs, and markdown briefs into Studio artifacts
- Artifact Studio supports sanitized HTML live preview/source editing, click-to-selector targeting, targeted visual edit prompts, persisted A/B Variant Studio groups, local Playwright browser evidence capture, video briefs, Design DNA extraction, artifact history, revision snapshots, and one-click revert
- Approval Center supports local approve/deny decisions and Hermes notification when the local gateway exposes an approval response route
- Docs updated for Mission Control, Design Canvas, Artifact Studio, Approval Center, and Hermes model/provider integration

## Next high-value milestones

- Visual diff UI for artifact revisions and checkpoint-linked rollback evidence
- Local concept-pack marketplace for animated theme worlds and reusable production kits
- Figma MCP metadata extraction and image/vision-assisted design reconstruction
- Rich MCP connection management using Hermes MCP CLI/API surfaces only
- Full Hermes Kanban dispatch/claim UI for multi-profile local agents

## Phase 0 — Repo Reorganization

- Moved Textual TUI prototype to `legacy/textual-prototype/`
- Created `apps/desktop-studio/` placeholder
- Added `pnpm-workspace.yaml` and root `package.json`
- Updated README, ARCHITECTURE, ROADMAP for desktop-first direction
- Added `docs/PRODUCT_DIRECTION.md` and `docs/ADR-0001-desktop-first.md`
- Added placeholder theme packs (example-minions, example-lotr)

## Phase 1 — Protocol and Schemas

- `packages/protocol/openapi.yaml` — Adapter API specification with `/studio/*` route parity tests
- `packages/protocol/events.schema.json` — Normalized event types (15 events)
- `packages/protocol/theme.schema.json` — Theme pack TOML schema
- `packages/protocol/layout.schema.json` — Layout pack TOML schema
- `packages/protocol/plugin.schema.json` — Plugin manifest schema
- `packages/shared-types/src/` — TypeScript type definitions (events, theme, layout, Kanban, runs, artifacts, plugin)

## Phase 2 — Desktop Studio Skeleton

- Tauri v2 + React + TypeScript + Vite project initialization
- Main layout: left activity rail / left sidebar / center tabs / right panel / bottom panel / status bar
- CSS variable theming from concept pack data
- Theme switcher (5 themes: default-dark, minecraft-overworld, example-minions, example-lotr, minimal-light)
- Keyboard shortcuts (Ctrl+K command palette)
- Zustand stores (theme, layout, session, run, ui)
- Command palette with sample commands and keyboard navigation
- Chat placeholder with mock messages and tool chips
- Kanban placeholder with 5 columns and 8 mock cards
- Right inspector panel (model, tools, memory)
- Bottom activity/log panel with mock data
- Status bar with profile, path, model, theme info

## Phase 3 — Fake Adapter + UI Integration

- Adapter: `/studio/*` endpoints (16 endpoints, fake in-memory data)
- Adapter: Fake run with SSE event sequence (run.started → delta → tool → completed)
- Adapter: Stop run (run.cancelled event)
- Adapter: Logs stream (fake log.line events every 1.5s)
- Adapter: Themes, config, profiles, sessions endpoints
- Desktop: studioClient.ts (typed API client + SSE parser)
- Desktop: adapterStore (connection status)
- Desktop: runStore (send prompt, consume SSE, stop)
- Desktop: sessionStore (load from adapter)
- Desktop: ChatSurface (real streaming, stop button, tool chips)
- Desktop: StatusBar (adapter connection indicator)
- Root dev scripts (dev:adapter, dev:desktop)

## Phase 3.5 — Stabilization and Contract Alignment

- Health endpoint alignment: `/studio/health` exists for Studio, root `/health` exists for adapter/dev tooling
- OpenAPI audit: duplicate `/studio/config` fixed, paths aligned with implementation
- SSE robustness: clean cancellation, unknown event tolerance, disconnect handling
- Frontend fallback: adapter unavailable shows warning, composer has visual indicator
- QA checklist: `docs/QA_CHECKLIST.md` with 40+ manual smoke test items
- Adapter tests: 17 new tests for `/studio/*` endpoints (52 total passing)
- Dev commands documented: `dev:adapter`, `dev:desktop`, `build`

## Phase 4A — Real Hermes Chat Bridge

- Backend abstraction: `StudioBackend` base class, `MockBackend`, `HermesBackend`
- Backend config: env vars `HERMES_STUDIO_BACKEND` (local/gateway/hermes/ssh/mock/auto), `HERMES_API_BASE_URL`, `HERMES_API_KEY`
- Backend factory: auto mode tries local CLI, then gateway, then mock
- HermesBackend: health, bootstrap, start_run, stream_run_events (SSE proxy), stop_run
- Event normalization: Hermes SSE → Studio events (OpenAI delta, tool, approval, run lifecycle)
- studio_routes.py: delegates to backend abstraction layer
- Health endpoints: report backend mode, Hermes reachability, last error
- Frontend: StatusBar shows backend mode (Mock/Hermes/Auto)
- Tests: 16 new tests (event normalization, HermesBackend, auto fallback) — 68 total passing
- Frontend build: tsc + vite pass

## Phase 4A.5 — Hermes Bridge Hardening

- Smoke test docs: `docs/REAL_HERMES_SMOKE_TEST.md` with manual test checklist
- Debug mode: `HERMES_STUDIO_DEBUG_EVENTS=1` logs raw/normalized events with redaction
- Fixture capture: `scripts/capture_hermes_sse.py` for manual SSE capture
- Fixture replay test: `tests/fixtures/hermes_sse_sample.jsonl` + replay tests
- Error hardening: clear messages for Hermes unreachable, auto fallback, hermes mode failures
- Tests: 72 total passing (4 new fixture replay tests)

## Phase 4B — Read-only Hermes Sessions

- session_repository.py: Hermes home bulma, state.db read-only, schema detection
- Defensive schema detection: tables, columns, FTS, graceful fallback
- HermesBackend: list_sessions, get_session, search_sessions from real DB
- Bootstrap response includes session_source info
- Frontend: sessionStore loads from adapter with source tracking
- Left sidebar: adapter-loaded sessions with message count
- Sessions center tab: session list, detail view, transcript preview, search filter
- Session detail: metadata + transcript preview from adapter
- assistant.delta payload verified: text field present in all normalization paths
- docs/HERMES_STATE_READONLY.md: read-only guarantee, env vars, troubleshooting
- Tests: 18 new tests (fixture DB, FTS, read-only verification) — 92 total passing

## Phase 4B.5 — Session UX Completion

- SessionsPanel: adapter-loaded sessions, detail view, search, empty state
- assistant.delta payload verified: text field in all 4 normalization paths
- Build: tsc + vite pass

## Phase 4C — Real Hermes Logs + Profiles

- log_repository.py: log directory discovery, reading, redaction, tail
- profile_repository.py: profile discovery, metadata, active profile detection
- HermesBackend: list_profiles, get_active_profile, get_logs, stream_logs
- /studio/profiles, /studio/profiles/active, /studio/profiles/activate (501)
- /studio/logs: source and tail query params
- /studio/logs/stream: source param
- Bootstrap: profiles_available, profile_count, logs_available, log_sources
- Health: logs and profiles status
- Log redaction: bearer, api_key, hex, key prefixes
- Tests: 19 new (log repo, profile repo, redaction) — 111 total passing
- docs/HERMES_LOGS_AND_PROFILES.md

## Phase 4C.5 — Profiles + Logs UI Completion

- profileStore: load profiles/active, activate with 501 handling
- logStore: load recent, stream, source selector, level parsing
- Left sidebar: real profiles with activate + error display
- StatusBar: active profile name from store
- Bottom panel: real logs with source selector, stream, refresh, clear
- Log lines: level-colored (info/warn/error)
- AppFrame: loads profiles + logs on startup
- studioClient: getActiveProfile, activateProfile, getLogs(source, tail)
- Build: tsc + vite pass, 111 adapter tests passing

## Phase 4D — Model/Provider Config Viewer

- config_repository.py: config.yaml + .env okuma, redaction, secret detection
- Backend: get_model_config(), get_provider_status()
- /studio/model-config endpoint
- Bootstrap: model_config metadata
- Frontend: RightPanel Model section wired to adapter
- Model panel: provider, model, api key status, context, warnings
- Command palette: Refresh Model Config, Show Provider Status
- Tests: 14 new (config repository) — 125 total passing
- docs/HERMES_MODEL_PROVIDER_VIEWER.md

## Phase 5 — Real Theme Concept Pack Loader

- theme_repository.py: TOML discovery, validation, inheritance, activate, reload
- Built-in themes: default-dark, minimal-light, minecraft-overworld, example-minions, example-lotr
- Theme TOML files updated with full semantic slot labels
- Backend: list_themes, get_theme, get_active_theme, activate_theme, reload_themes
- /studio/themes, /studio/themes/{id}, /studio/themes/active, /studio/themes/activate, /studio/themes/reload
- HermesBackend + MockBackend: both use theme repository
- Frontend: themeStore loads from adapter, activateTheme via API
- Theme Gallery: adapter themes, source info, validity, reload button
- Activation persists in ~/.config/hermes-desktop-studio/config.json
- Tests: 20 new (theme repository) — 145 total passing
- docs/THEME_PACKS.md: format, semantic slots, inheritance, search paths, creating custom themes

## Phase 5.5 — Theme UI Integration and Route QA

- Route ordering QA: /themes/active, /themes/reload not captured by {theme_id}
- MockBackend: get_theme/get_active_theme return normalized format (meta wrapper)
- Route tests: active, reload, get by id, not found, route ordering
- Tests: 5 new route tests — 150 total passing
- Build: tsc + vite pass

## Phase 5.6 — Theme Frontend Integration

- themeStore: adapter themes as primary, local fixtures as fallback
- loadThemes(): loads all adapter themes + active theme, merges with fallback
- activateTheme(): POST /themes/activate + get normalized + apply CSS
- reloadThemes(): POST /themes/reload + reload all
- AppFrame: calls loadThemes after authenticated adapter connection; local fallback remains available offline
- Theme Gallery: author, version, source, validity, warnings, active indicator
- Theme Gallery: loading state, error state, empty state, reload button
- TS fixtures: marked as fallback-only with clear comments
- Semantic labels/icons: all components use label()/icon() from theme store
- Build: tsc + vite pass, 150 adapter tests passing

## Phase 5.7 — Studio Protocol Hardening Before Kanban

- Tauri auth bootstrap: desktop reads adapter token through Rust command bridge, browser dev uses explicit Vite env token
- Protected `/studio/*` calls fail clearly when token is unavailable; token is not stored in `localStorage`
- Canonical frontend health endpoint is `/studio/health`; root `/health` remains adapter/dev tooling health only
- Legacy `/shell/*` routes disabled by default; opt-in with `HERMES_STUDIO_ENABLE_LEGACY_SHELL_ROUTES=1`
- Standard error envelope across backend and frontend parser
- Studio event envelope guaranteed: `id`, `type`, `timestamp`, `source`, `payload`, optional `run_id`/`session_id`
- MockBackend and HermesBackend SSE events validate against `events.schema.json`
- OpenAPI route parity test covers implemented `/studio/*` paths
- Tauri CSP set to a restrictive local-app policy
- Python lint/type baseline clean: ruff and mypy pass
- Shared types package has a local TypeScript dev dependency and typechecks
- Tests/build: adapter tests, frontend API tests, frontend build, and Tauri cargo check pass

## Later — Polish and Accessibility

- Keyboard navigation (full keyboard usability)
- High-contrast mode
- Reduced motion support
- Font scale support
- Error states and retry flows
- Approval UX refinement

## Phase 6 — Persistent Studio-owned Kanban Workflow

- Phase 6B foundation: Studio-owned `studio.db` location resolution, migrations, metadata, health/bootstrap status
- Storage safety: no Hermes `state.db` writes, no secrets, guard against `HERMES_STUDIO_DB_PATH` pointing at Hermes state
- docs/STUDIO_STORAGE.md
- Phase 6C backend protocol: persistent Studio-owned Kanban repository, default board, and default columns
- Define Studio-owned Kanban persistence schema outside Hermes core/state.db
- Add `/studio/kanban/*` protocol paths and OpenAPI coverage before frontend wiring
- Implement adapter persistence with local Studio storage and migration/version metadata
- Add tests for CRUD, ordering, migration, event normalization, and read-only Hermes guarantees
- Keep theme/concept pack Kanban presentation generic and semantic-slot driven
- Wire frontend Kanban store/components to `/studio/*` only

## Phase 6C.5 — Real Local Hermes Discovery and Integration Audit

- Verified installed Hermes CLI and gateway API server surface against `Hermes Agent v0.13.0`
- Documented official local API server start path: `API_SERVER_ENABLED=true hermes gateway --accept-hooks run`
- Fixed HermesBackend run payload, capabilities parsing, SSE event parsing, stop status handling, and Hermes error message extraction
- Added sanitized runtime compatibility fixtures and schema replay tests
- Confirmed local Hermes `state.db`, logs, config, and `.env` assumptions read-only without storing secrets

## Phase UX-1 — Run-Centered Desktop Workbench Foundation

- Product direction: `docs/RUN_CENTERED_WORKBENCH.md`
- UI direction: `docs/UI_DIRECTION.md`
- Activity rail realigned around Runs, Chat, Board, Sessions, Artifacts, Context, Logs, Themes, Settings
- Center workbench tabs: Run Ledger, Chat, Board, Sessions, Artifacts
- Run Ledger v0 uses existing run/SSE data for current-session timeline inspection
- Chat repositioned as a prompt surface connected to the Run Ledger
- Artifact Shelf, Context Stack Inspector, and Approval Center placeholders established
- Bottom panel realigned around Activity, Tool Events, Logs, Adapter Diagnostics
- No Kanban drag-and-drop, animated concept runtime, Hermes core changes, or Hermes state writes

## Phase Product-1 — Run Ledger v1 and Useful Workflow Actions

- Studio-owned Run Ledger migration: `runs` and `run_events` in `studio.db`
- `/studio/runs/recent`, `/studio/runs/{run_id}`, and `/studio/runs/{run_id}/ledger`
- Streaming persistence wrapper stores normalized Studio event envelopes without breaking SSE
- Secret redaction for prompt previews and persisted event payloads
- Frontend Run Ledger loads recent runs, selects persisted ledgers, and merges live SSE events
- Timeline grouping for assistant messages and tool call event sequences
- Run detail shows status, duration, backend/model, linked session, warnings, and errors
- Workflow actions: create Kanban card from run, copy run summary, open related session
- Tests for migrations, persistence, route ordering, streaming fallback, frontend store behavior, and no Hermes `state.db` writes

## Phase UX-2 — Professional Desktop Studio Shell and Runtime UX

- Top desktop workbench bar with app identity, workspace, New Run, runtime chips, command palette, and panel toggles
- Runtime status surface shows adapter, auth, backend mode, active backend, Hermes reachability, Hermes URL, profile, model/provider, and storage
- MockBackend and Auto fallback are clearly labeled with warnings and fallback reasons
- Manual workspace picker, recent workspaces, status/top bar display, and New Run workspace field
- Workspace path persists as Studio-owned run metadata without forwarding invented Hermes fields
- New Run modal submits through `/studio/runs` with prompt, workspace, profile/model context, session, linked card placeholder, and run mode
- Collapsible left sidebar, right inspector, and bottom panel with responsive workbench layout
- Command palette commands for New Run, New Chat, Select Workspace, Runtime Status, Run Ledger, Board, Sessions, Refresh Adapter Status, Theme, and Settings
- Board placeholder now uses Studio-owned Kanban backend data instead of pretending mock cards are real

## Phase Product-2 — Kanban Frontend Integration as Run/Session Control Surface

- Dedicated frontend Kanban store for loading, refreshing, creating, updating, moving, archiving, and linking cards through `/studio/kanban/*`
- Board tab renders persistent backend columns/cards with loading, error, empty, refresh, and adapter-unavailable states
- Create/edit card modal with title, description, priority, column/status, linked session id, and linked run id
- Explicit move controls replace drag-and-drop for now
- Cards show priority, updated time, linked run, and linked session indicators
- Run Ledger "Create Card from Run" refreshes the board after creating a linked card
- Sessions can create linked Studio-owned Kanban cards
- No Hermes core changes, no Hermes `state.db` writes, no cloud sync, and no animated concept-pack work

## Phase Product-3 — Artifact Shelf v1

- Studio-owned Artifact migration: `artifacts` and `artifact_events` in `studio.db`
- `/studio/artifacts/*` protocol paths with OpenAPI route parity coverage
- Artifact repository with create/list/detail/update/archive and run/session/card link operations
- Redaction for obvious secret-like text and bounded content size
- Artifact Shelf frontend store and UI for list, filter, search, detail, manual create, and archive
- Safe detail viewer for markdown, text, JSON, logs, HTML source, and file references without script execution
- Run Ledger can create run summary, markdown report, and log snapshot artifacts
- Sessions can create linked session summary artifacts
- Board cards can create linked card summary artifacts
- No Hermes core changes, no Hermes `state.db` writes, no cloud sync, and no animated concept-pack work

## Phase Product-4 — Context Inspector v1

- Read-only Context Inspector aggregation service for current, run, session, and workspace scopes
- `/studio/context/*` protocol paths with OpenAPI route parity coverage
- Safe workspace context file discovery for SOUL.md, AGENTS.md, CLAUDE.md, README.md, package.json, pyproject.toml, and Cargo.toml
- Length-limited previews, secret redaction, path traversal rejection, and symlink skipping
- Context snapshots include active profile, model/provider config, runtime status, storage status, workspace, run/session metadata, related artifacts, related Kanban cards, and related runs/sessions
- Frontend Context Inspector store and UI for current/run/session/workspace scopes with loading, error, warnings, unavailable memory/skills states, and related work
- Run Ledger, Sessions, Artifact Shelf, and linked Board cards can open scoped context
- No Hermes core changes, no Hermes `state.db` writes, no Hermes config writes, and no memory/skill editor work

## Phase Product-5 — Approval Center v1

- Studio-owned Approval Center migration: `approvals` and `approval_events` in `studio.db`
- `/studio/approvals/*`, `/studio/runs/{run_id}/approvals`, and `/studio/sessions/{session_id}/approvals` protocol paths with OpenAPI route parity coverage
- Approval repository with list/detail/pending/run/session filters and redacted request payload storage
- Run stream capture for `approval.requested` and `approval.resolved` without breaking SSE on persistence failure
- Approval response routes return `501 Not Implemented` until a verified Hermes approval response API is wired
- Approval Center frontend store and UI for pending/history, filters, risk/status, detail payload preview, and run/session links
- Run Ledger highlights approval events and can open approvals for the selected run
- Context Inspector includes related approvals for selected run/session context
- Activity rail and status bar show pending approval counts without noisy prompts
- No Hermes core changes, no Hermes `state.db` writes, no Hermes config writes, and no approval bypass

## Phase Product-6 — Process Management

- Process manager with predefined templates (dev-server, adapter, test-runner, build)
- /studio/processes/* endpoints (list, start, stop, logs, remove)
- Process cockpit frontend with template grid and process cards
- Tests for process manager and routes

## Phase Product-7 — Extensions and Tool Packs

- Tool pack schema (toolPack.schema.json)
- Tool pack repository with discovery, validation, enable/disable
- /studio/tool-packs/* endpoints
- Extensions panel frontend
- Example tool pack (example-tools)

## Phase Product-8 — Checkpoints and Worktrees

- Checkpoint repository (git commit timeline)
- /studio/checkpoints/* endpoints
- Checkpoint timeline frontend component
- Safe rollback/repair prompt handoff from selected checkpoint diff
- Worktree repository (git worktree CRUD)
- /studio/worktrees/* endpoints
- Worktree launcher frontend component

## Phase Product-9 — Delegations and Cron

- Delegation repository (sub-agent tracking from run events)
- /studio/delegations/* endpoints
- Delegation panel frontend
- Cron repository (read from ~/.hermes/cron/)
- /studio/cron-jobs/* endpoints
- Cron panel frontend

## Phase Product-10 — Security Hardening

- Secret guard with 14 detection patterns
- Input validator for all API inputs
- Audit logging to studio.db
- DB hardening (WAL mode, backup rotation, integrity checks)
- Token security (rotation, expiry, rate limiting)
- TOCTOU-safe token file creation

## Phase Product-11 — Native Desktop Features

- System tray with menu (Show/Hide, New Run, Quit)
- Global shortcuts (Ctrl+Shift+N, Ctrl+Shift+H)
- Native notifications (run complete, approval needed)
- Preview Canvas (second window for URL preview)
- Playwright test infrastructure (33 E2E tests)

## Phase Product-12 — Connection Resilience

- Circuit breaker pattern for Hermes API
- Retry with exponential backoff
- SSE buffer size limit (1MB)
- Log rotation detection
- Connection caching for studio.db

## Phase Product-13 — Hermes v0.13.0 Integration

- X-Hermes-Session-Key header support
- Post-write lint event handling
- i18n support (display.language config)
- Memory system integration (~/.hermes/memories/)
- Skills system integration (~/.hermes/skills/)
- Profile switching (API + CLI fallback)
- Approval response wiring (approve/deny)

## Next core layers

- Persist Run Ledger history in Studio-owned `studio.db`
- Artifact Shelf v1 with persistent metadata and safe text/reference viewer
- Context Inspector v1 with safe read-only local aggregation
- Approval Center visibility, audit, and local approve/deny decision flow
- Process Management with template-based process cockpit
- Extensions and Tool Packs with discovery and enable/disable
- Checkpoints and Worktrees for git-based timeline and branching
- Delegations and Cron for sub-agent tracking and scheduling
- Security hardening (secret guard, input validation, audit logging)
- Native desktop features (tray, shortcuts, notifications, Preview Canvas)
- Connection resilience (circuit breaker, retry, buffer limits)
- Hermes v0.13.0 integration (session key, i18n, memory, skills, profiles)
- Local Playwright browser evidence capture for HTML/URL/file artifacts
- Figma URL import path for Hermes Design Canvas handoff
- Artifact extraction from real run outputs and sanitized Preview Canvas
- Real approval response wiring after verified Hermes API support
- Richer concept packs after the workbench spine is stable

## Phase 7 — Packaging and Release

- Tauri native installers (Linux, macOS)
- Auto-update mechanism
- GitHub Releases pipeline
- Documentation for users