# QA Checklist — Hermes Desktop Studio

Manual smoke test checklist for verifying the desktop studio works correctly.

## Desktop Runtime

- [ ] `pnpm run dev:adapter` starts adapter on `127.0.0.1:39191`
- [ ] `pnpm run tauri dev` opens a native Tauri window
- [ ] No browser tab is required for the real desktop runtime
- [ ] Window title is Hermes Desktop Studio
- [ ] Protected `/studio/*` calls work through the Tauri token bridge
- [ ] Top bar shows Hermes Desktop Studio, New Run, current workspace, runtime chips, and command palette trigger
- [ ] Left sidebar, right inspector, and bottom panel can be collapsed

## Optional Browser Visual Smoke

- [ ] `pnpm run test:visual:firefox` starts/uses the Vite frontend and launches Firefox when available
- [ ] Missing Playwright Firefox prints `pnpm run test:visual:install` and skips without confusing Chrome/Puppeteer errors
- [ ] `PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH=/usr/bin/firefox pnpm run test:visual:firefox` is documented as an optional system Firefox override
- [ ] Smoke test verifies activity rail entries: Runs, Chat, Board, Sessions, Artifacts, Context, Logs, Themes, Settings
- [ ] Smoke test verifies the Run Ledger tab exists
- [ ] Smoke test fails on fatal React/Vite overlay text
- [ ] Optional screenshot is written to `artifacts/visual-smoke/home.png` and is not committed

## Adapter Connection

- [ ] `pnpm run dev:adapter` starts adapter on `127.0.0.1:39191`
- [ ] `GET /studio/health` returns `{"status":"healthy",...}` and is the endpoint used by the desktop client
- [ ] `GET /health` returns adapter/dev tooling health only
- [ ] Desktop app shows green "Adapter: Connected" in status bar
- [ ] Killing adapter shows red "Adapter: Disconnected" in status bar
- [ ] App does not crash when adapter is unavailable
- [ ] Runtime status distinguishes Mock, Hermes, and Auto fallback
- [ ] Mock backend shows a clear warning and never appears as real Hermes
- [ ] Real Hermes instructions are visible in Runtime Status / Settings
- [ ] Refresh runtime status calls `/studio/health` and updates the UI

## Workspace and New Run

- [ ] Select Workspace opens the workspace picker
- [ ] Manual workspace path appears in the top bar and status bar
- [ ] Recent workspaces are listed after selecting a path
- [ ] New Run modal includes prompt, workspace path, profile, model/provider, session, linked card, and run mode
- [ ] Starting a run from New Run sends through `/studio/runs`
- [ ] Workspace path appears in Chat header and Run Ledger
- [ ] Workspace path persists in Studio-owned run metadata after adapter restart
- [ ] No workspace path is written to Hermes `state.db`

## Auth and Protocol

- [ ] Tauri desktop starts with protected `/studio/*` calls working without manual token entry
- [ ] Browser dev works when `VITE_HERMES_STUDIO_ADAPTER_TOKEN` matches the adapter token
- [ ] Missing token shows "Auth token missing" or an equivalent clear adapter status
- [ ] No adapter token appears in `localStorage`
- [ ] Protected calls without `Authorization` return the standard `{ "error": ... }` envelope
- [ ] Desktop network traffic uses `/studio/*` for data calls and never `/shell/*`
- [ ] Default route list does not include `/shell/*`
- [ ] `HERMES_STUDIO_ENABLE_LEGACY_SHELL_ROUTES=1` mounts `/shell/*` for prototype/reference use only

## Run-Centered Workbench

- [ ] App opens with Run Ledger as the primary center tab
- [ ] Activity rail includes Runs, Chat, Board, Sessions, Artifacts, Context, Logs, Themes, and Settings
- [ ] Starting a prompt creates a current run in the Run Ledger
- [ ] Recent runs persist in Studio-owned `studio.db` and reappear after adapter restart
- [ ] Selecting a recent run loads its persisted timeline from `/studio/runs/{run_id}/ledger`
- [ ] Run Ledger timeline shows `run.started`, assistant stream, tool events, warnings, and terminal events when present
- [ ] Assistant deltas are grouped into a readable assistant message entry
- [ ] Tool started/progress/completed events are grouped by tool call when possible
- [ ] Selecting a timeline entry shows event payload detail
- [ ] Run Ledger shows status, duration, backend/model, linked session id, warnings, and errors when available
- [ ] Run Ledger shows workspace path when selected
- [ ] "Create Card from Run" creates a Studio-owned Kanban card linked to `run_id`
- [ ] "Copy Run Summary" copies prompt, status, session, backend/model, duration, and timeline summary
- [ ] "Open Related Session" switches to the Sessions tab when `session_id` exists
- [ ] Right inspector shows selected run, model, tools, memory, context, approvals, and diagnostics
- [ ] Bottom panel Activity and Tool Events reflect current run events
- [ ] Artifact Shelf placeholder renders categories for files, markdown, screenshots, tests, log snapshots, HTML previews, and reports
- [ ] Context Inspector placeholder renders guidance files, memory, skills, references, active profile, and model/provider status
- [ ] Approval Center shows no pending approvals and recent approval events when present
- [ ] Themes still switch after the UX-1 shell realignment
- [ ] Logs, profiles, sessions, and model viewer still load from the adapter when available

## Chat

- [ ] Typing in composer and pressing Enter sends prompt
- [ ] `POST /studio/runs` returns `run_id`
- [ ] `assistant.delta` text appears progressively in chat
- [ ] SSE event JSON includes `id`, `type`, `timestamp`, `source`, and `payload`
- [ ] `tool.started` shows running tool chip
- [ ] `tool.completed` shows completed tool chip with duration
- [ ] `run.completed` stops streaming, typing indicator disappears
- [ ] Stop button (red) appears during streaming
- [ ] Stop button calls `POST /studio/runs/{id}/stop`
- [ ] `run.cancelled` event stops the stream cleanly
- [ ] No duplicate messages after `run.completed`
- [ ] Composer shows warning border when adapter is disconnected
- [ ] Sending message when adapter offline shows local fallback message
- [ ] Chat header shows current/last run id and status
- [ ] Chat header shows session, workspace, model/runtime state, and mock-data warning when applicable
- [ ] "Open in Run Ledger" switches to the Run Ledger tab
- [ ] Create-card-from-run action creates a linked Studio-owned Kanban card when a run exists

## Tabs

- [ ] Run Ledger tab renders the run timeline surface
- [ ] Chat tab renders prompt/chat surface
- [ ] Board tab renders the paused board control surface
- [ ] Board uses Studio-owned Kanban data or clearly reports adapter/backend unavailability
- [ ] Artifacts tab renders Artifact Shelf placeholder
- [ ] Sessions tab renders sessions surface
- [ ] Switching tabs during streaming does not break the stream

## Sidebar

- [ ] Sessions section lists sessions from adapter
- [ ] Clicking a session sets it as active
- [ ] Profiles section shows profile list
- [ ] Context section shows the Context Stack Inspector placeholder
- [ ] Logs section can switch bottom panel tabs
- [ ] Theme Gallery shows 5 theme cards
- [ ] Clicking a theme card switches theme
- [ ] Theme switch changes colors, labels, and icons

## Right Panel

- [ ] Selected Run section updates after a run starts
- [ ] Model section shows model/provider info
- [ ] Tools section shows tool events for the selected run
- [ ] Memory section shows current placeholder memory entries
- [ ] Context section shows current placeholder context entries
- [ ] Diagnostics section shows adapter/backend/Hermes status

## Bottom Panel

- [ ] Activity tab shows recent run events
- [ ] Tool Events tab shows current run tool events
- [ ] Logs tab shows log lines
- [ ] Adapter Diagnostics tab shows adapter/backend/Hermes status

## Command Palette

- [ ] `Ctrl+K` opens command palette
- [ ] Typing filters commands
- [ ] Arrow keys navigate command list
- [ ] Enter executes selected command
- [ ] Escape closes palette
- [ ] "Open Run Ledger" command switches to Run Ledger
- [ ] "New Run", "New Chat", "Select Workspace", "Open Runtime Status", and "Refresh Adapter Status" commands are available
- [ ] "Switch Theme" command opens theme gallery
- [ ] "Toggle Right Panel" hides/shows right panel
- [ ] "Toggle Bottom Panel" hides/shows bottom panel

## Theming

- [ ] Default Dark theme applies on startup
- [ ] Switching to Minecraft Overworld changes all colors and labels
- [ ] Switching to Minimal Light changes to light theme
- [ ] Theme activation persists in Studio config across restarts
- [ ] Theme switch does not break streaming if active

## Contract Checks

- [ ] `pytest` includes OpenAPI route parity and event schema validation tests
- [ ] `packages/protocol/openapi.yaml` documents all implemented `/studio/*` routes
- [ ] `packages/protocol/events.schema.json` matches MockBackend and Hermes fixture replay events
- [ ] Sanitized real Hermes runtime fixtures replay through the event normalizer and satisfy `events.schema.json`
- [ ] `docs/HERMES_RUNTIME_COMPATIBILITY.md` reflects the installed Hermes version and API server command used for smoke testing

## Studio Storage

- [ ] `GET /studio/health` includes `storage.available`, `storage.schema_version`, `storage.data_dir`, `storage.db_path`, and `storage.last_error`
- [ ] `GET /studio/bootstrap` includes the same storage metadata
- [ ] `studio.db` is created under `HERMES_STUDIO_HOME` when the env var is set
- [ ] Repeated adapter starts do not duplicate migration rows
- [ ] `HERMES_STUDIO_DB_PATH=~/.hermes/state.db` is rejected
- [ ] Hermes `~/.hermes/state.db` is not modified by Studio startup
- [ ] Storage metadata contains diagnostics only; no secrets are stored in `studio_meta`
- [ ] `runs` and `run_events` tables are created by migration 3
- [ ] Run Ledger payloads and prompt previews are redacted before persistence
- [ ] Persistence errors emit a warning or UI notice without breaking live run streaming

## Studio Kanban Backend

- [ ] `GET /studio/kanban/boards/default` creates one persistent default board
- [ ] Default columns are Inbox, Ready, Doing, Blocked, Done
- [ ] `POST /studio/kanban/cards` creates a card in Studio-owned `studio.db`
- [ ] `PATCH /studio/kanban/cards/{card_id}` updates sanitized card fields
- [ ] `POST /studio/kanban/cards/{card_id}/move` persists column and position changes
- [ ] Archive, link-session, and link-run endpoints return standard card shapes
- [ ] Kanban routes require adapter auth and return the standard error envelope
- [ ] Malformed `kanban.updated` events become `adapter.warning`
- [ ] Kanban tests verify no writes to Hermes `state.db`

## Studio Kanban Frontend

- [ ] Board tab loads the persistent default board from `/studio/kanban/boards/default`
- [ ] Adapter unavailable or missing auth shows a clear Board error state, not mock cards
- [ ] Create Card opens the editor and persists a card in Studio-owned `studio.db`
- [ ] Edit Card updates title, description, priority, and status
- [ ] Move controls can move a card to Inbox, Ready, Doing, Blocked, and Done
- [ ] Archive removes the card from the active board
- [ ] Cards show priority, updated time, linked run id, and linked session id when present
- [ ] Run Ledger "Create Card from Run" creates a linked card and Board refreshes
- [ ] Sessions "Create Card from Session" creates a linked card and Board refreshes
- [ ] Theme switching preserves readable columns/cards and uses semantic CSS variables
- [ ] No drag-and-drop is required for this phase

## Status Bar

- [ ] Shows active profile name
- [ ] Shows working directory path
- [ ] Shows model name
- [ ] Shows adapter connection status (green/red dot)
- [ ] Shows active theme name
- [ ] Shows version number

## Edge Cases

- [ ] Rapid prompt sending does not break state
- [ ] Opening command palette during streaming pauses input
- [ ] Closing adapter mid-stream shows error in chat
- [ ] Restarting adapter reconnects on next health check
- [ ] Empty prompt does not send

## Logs

- [ ] Bottom Logs tab shows log lines from adapter
- [ ] Log lines are color-coded by level (info/warn/error)
- [ ] Source selector works (agent.log, errors.log, gateway.log)
- [ ] Empty state when logs unavailable
- [ ] Secrets/API keys are redacted from log output
- [ ] Log stream auto-scrolls (or shows new lines)

## Profiles

- [ ] Left sidebar Profiles section shows profile list
- [ ] Active profile is highlighted
- [ ] Profile count is shown
- [ ] Clicking a profile shows "switching not implemented" notice
- [ ] Status bar shows active profile name
- [ ] Empty state when no profiles found
