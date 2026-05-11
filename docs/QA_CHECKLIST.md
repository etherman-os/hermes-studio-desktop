# QA checklist — Hermes Desktop Studio

Manual smoke test checklist for verifying the desktop studio works correctly.

## Desktop runtime

The adapter starts on `127.0.0.1:39191` when you run `pnpm run dev:adapter`. The Tauri window opens with `pnpm run tauri dev` and requires no browser tab. The window title reads "Hermes Desktop Studio". Protected `/studio/*` calls work through the Tauri token bridge. The top bar shows the app name, New Run button, current workspace, runtime chips, and the command palette trigger. The left sidebar, right inspector, and bottom panel can all be collapsed.

## Optional browser visual smoke

Running `pnpm run test:visual:firefox` starts the Vite frontend and launches Firefox when available. If Playwright Firefox is not installed, the command prints `pnpm run test:visual:install` and skips without producing confusing Chrome or Puppeteer errors. You can override the system Firefox executable with `PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH=/usr/bin/firefox pnpm run test:visual:firefox`. The smoke test verifies that activity rail entries exist for Mission, Runs, Chat, Board, Sessions, Design, Artifacts, Context, Logs, Themes, and Settings, and that the Mission Control and Run Ledger tabs are present. It fails on fatal React or Vite overlay text. An optional screenshot writes to `artifacts/visual-smoke/home.png` and is never committed.

## Adapter connection

The adapter starts on `127.0.0.1:39191` when you run `pnpm run dev:adapter`. The `GET /studio/health` endpoint returns `{"status":"healthy",...}` and is the endpoint the desktop client uses, while `GET /health` returns adapter and dev tooling health only. The desktop app shows a green "Adapter: Connected" indicator in the status bar. Killing the adapter switches this to red "Adapter: Disconnected". The app does not crash when the adapter is unavailable. Runtime status distinguishes Mock, Hermes, and Auto fallback. The Mock backend shows a clear warning and never pretends to be real Hermes. Real Hermes instructions are visible in Runtime Status and Settings. Refreshing runtime status calls `/studio/health` and updates the UI.

## Workspace and New Run

Selecting a workspace opens the workspace picker. The manual workspace path appears in the top bar and status bar. Recent workspaces are listed after selecting a path. The New Run modal includes prompt, workspace path, profile, model or provider, session, linked card, and run mode. New Run presets include implementation, review, debug, design, browser verification, multi-agent, Kanban swarm, video, and Studio memory modes, each prefilling appropriate skills, toolsets, checkpoints, max turns, and worktree or session toggles. Starting a run from New Run sends through `POST /studio/runs`. The workspace path appears in the Chat header and Run Ledger. Workspace path persists in Studio-owned run metadata after adapter restart. No workspace path is written to Hermes `state.db`.

## Auth and protocol

The Tauri desktop starts with protected `/studio/*` calls working without manual token entry. Browser dev works when `VITE_HERMES_STUDIO_ADAPTER_TOKEN` matches the adapter token. A missing token shows "Auth token missing" or an equivalent clear adapter status. No adapter token appears in `localStorage`. Protected calls without `Authorization` return the standard `{ "error": ... }` envelope. Desktop network traffic uses `/studio/*` for data calls and never `/shell/*`. The default route list does not include `/shell/*`. Setting `HERMES_STUDIO_ENABLE_LEGACY_SHELL_ROUTES=1` mounts `/shell/*` for prototype or reference use only.

## Run-centered workbench

The app opens with Mission Control as the primary center tab. The activity rail includes Mission, Runs, Chat, Board, Sessions, Design, Artifacts, Processes, Context, Approvals, Hermes Arsenal, Delegations, Cron, Logs, Themes, and Settings. Starting a prompt creates a current run in the Run Ledger. Recent runs persist in Studio-owned `studio.db` and reappear after adapter restart. Selecting a recent run loads its persisted timeline from `GET /studio/runs/{run_id}/ledger`. The Run Ledger timeline shows `run.started`, assistant stream, tool events, warnings, and terminal events when present. Assistant deltas are grouped into a readable assistant message entry. Tool started, progress, and completed events are grouped by tool call when possible. Selecting a timeline entry shows event payload detail. The Run Ledger shows status, duration, backend or model, linked session id, warnings, and errors when available. It also shows the workspace path when selected. "Create Card from Run" creates a Studio-owned Kanban card linked to `run_id`. "Copy Run Summary" copies prompt, status, session, backend or model, duration, and timeline summary. "Open Related Session" switches to the Sessions tab when `session_id` exists. The right inspector shows selected run, model, tools, memory, context, approvals, and diagnostics. The bottom panel Activity and Tool Events reflect current run events. Artifact Shelf renders persisted artifacts, filters, search, and selected artifact details. HTML artifacts show a live sanitized preview and source editor. Click-to-Edit mode captures a CSS selector from the HTML preview without running artifact scripts. Visual Edit, A/B Variants, Browser Check, Video Brief, and Design DNA actions open or send Hermes-targeted work. Board "Plan Agent Swarm" opens a Hermes Kanban or delegation run draft. Context Inspector renders active profile, model or provider, workspace files, runtime status, memory or skills availability, warnings, and related Studio work. Approval Center shows pending approvals, history, risk or status, run or session links, and local or Hermes notification state when present. Themes still switch after the UX-1 shell realignment. Logs, profiles, sessions, and model viewer still load from the adapter when available.

## Chat

Typing in the composer and pressing Enter sends a prompt. `POST /studio/runs` returns `run_id`. `assistant.delta` text appears progressively in chat. SSE event JSON includes `id`, `type`, `timestamp`, `source`, and `payload`. `tool.started` shows a running tool chip. `tool.completed` shows a completed tool chip with duration. `run.completed` stops streaming and the typing indicator disappears. A red Stop button appears during streaming. Clicking it calls `POST /studio/runs/{id}/stop`. The `run.cancelled` event stops the stream cleanly. No duplicate messages appear after `run.completed`. The composer shows a warning border when the adapter is disconnected. Sending a message when the adapter is offline shows a local fallback message. The chat header shows current or last run id and status, plus session, workspace, model or runtime state, and a mock-data warning when applicable. "Open in Run Ledger" switches to the Run Ledger tab. The create-card-from-run action creates a linked Studio-owned Kanban card when a run exists.

## Tabs

The Run Ledger tab renders the run timeline surface. The Chat tab renders the prompt and chat surface. The Board tab renders the paused board control surface and uses Studio-owned Kanban data or clearly reports adapter or backend unavailability. The Artifacts tab renders the persistent Artifact Shelf. The Sessions tab renders the sessions surface. Switching tabs during streaming does not break the stream.

## Sidebar

The Sessions section lists sessions from the adapter. Clicking a session sets it as active. The Profiles section shows the profile list. Context section shows the read-only Context Inspector. Approvals section opens the Approval Center. Logs section can switch bottom panel tabs. The Theme Gallery shows five theme cards. Clicking a theme card switches the theme, changing colors, labels, and icons.

## Right panel

The Selected Run section updates after a run starts. The Model section shows model or provider info. Tools section shows tool events for the selected run. Memory section shows current placeholder memory entries. Context section shows current context status and warnings. Diagnostics section shows adapter, backend, and Hermes status.

## Bottom panel

The Activity tab shows recent run events. Tool Events tab shows current run tool events. Logs tab shows log lines. Adapter Diagnostics tab shows adapter, backend, and Hermes status.

## Command palette

`Ctrl+K` opens the command palette. Typing filters commands. Arrow keys navigate the command list. Enter executes the selected command. Escape closes the palette. "Open Run Ledger" switches to Run Ledger. "New Run", "New Chat", "Select Workspace", "Open Runtime Status", and "Refresh Adapter Status" commands are available. "Open Approval Center" opens the approvals sidebar. "Switch Theme" opens the theme gallery. "Toggle Right Panel" hides or shows the right panel. "Toggle Bottom Panel" hides or shows the bottom panel.

## Theming

The Default Dark theme applies on startup. Switching to Minecraft Overworld changes all colors and labels. Switching to Minimal Light changes to a light theme. Theme activation persists in Studio config across restarts. Theme switch does not break streaming if active.

## Contract checks

`pytest` includes OpenAPI route parity and event schema validation tests. `packages/protocol/openapi.yaml` documents all implemented `/studio/*` routes. `packages/protocol/events.schema.json` matches MockBackend and Hermes fixture replay events. Sanitized real Hermes runtime fixtures replay through the event normalizer and satisfy `events.schema.json`. `docs/HERMES_RUNTIME_COMPATIBILITY.md` reflects the installed Hermes version and API server command used for smoke testing.

## Studio storage

`GET /studio/health` includes `storage.available`, `storage.schema_version`, `storage.data_dir`, `storage.db_path`, and `storage.last_error`. `GET /studio/bootstrap` includes the same storage metadata. `studio.db` is created under `HERMES_STUDIO_HOME` when the env var is set. Repeated adapter starts do not duplicate migration rows. `HERMES_STUDIO_DB_PATH=~/.hermes/state.db` is rejected. Hermes `~/.hermes/state.db` is not modified by Studio startup. Storage metadata contains diagnostics only — no secrets are stored in `studio_meta`. The `runs` and `run_events` tables are created by migration 3. Run Ledger payloads and prompt previews are redacted before persistence. Persistence errors emit a warning or UI notice without breaking live run streaming. The `artifacts` and `artifact_events` tables are created by migration 5. Artifact content is redacted and bounded before persistence. The `approvals` and `approval_events` tables are created by migration 6. Approval payloads are redacted before persistence.

## Studio Kanban backend

`GET /studio/kanban/boards/default` creates one persistent default board. Default columns are Inbox, Ready, Doing, Blocked, and Done. `POST /studio/kanban/cards` creates a card in Studio-owned `studio.db`. `PATCH /studio/kanban/cards/{card_id}` updates sanitized card fields. `POST /studio/kanban/cards/{card_id}/move` persists column and position changes. Archive, link-session, and link-run endpoints return standard card shapes. Kanban routes require adapter auth and return the standard error envelope. Malformed `kanban.updated` events become `adapter.warning`. Kanban tests verify no writes to Hermes `state.db`.

## Studio Kanban frontend

The Board tab loads the persistent default board from `GET /studio/kanban/boards/default`. An adapter unavailable or missing auth state shows a clear Board error, not mock cards. Create Card opens the editor and persists a card in Studio-owned `studio.db`. Edit Card updates title, description, priority, and status. Move controls can move a card to Inbox, Ready, Doing, Blocked, and Done. Archive removes the card from the active board. Cards show priority, updated time, linked run id, and linked session id when present. Run Ledger "Create Card from Run" creates a linked card and Board refreshes. Sessions "Create Card from Session" creates a linked card and Board refreshes. Theme switching preserves readable columns and cards and uses semantic CSS variables. No drag-and-drop is required for this phase.

## Studio artifacts

`GET /studio/artifacts` lists persisted artifact summaries without content bodies. `GET /studio/artifacts/{artifact_id}` returns artifact detail and content. `POST /studio/artifacts` creates markdown, text, log, report, json, or file-reference artifacts. `PATCH /studio/artifacts/{artifact_id}` updates sanitized artifact fields. Archive removes the artifact from the active shelf. Link-run, link-session, and link-card endpoints persist IDs. Secret-like text is redacted from artifact content. Oversized content is rejected safely. HTML artifacts are displayed in a sanitized sandbox preview and as source text — scripts are not executed. File-reference artifacts store path metadata only. Browser Check creates a report artifact before handing evidence collection to Hermes. Visual Edit prompts include optional selector or component target context. Artifact tests verify no writes to Hermes `state.db`.

## Artifact Shelf frontend

Artifact Shelf loads persisted artifacts from `GET /studio/artifacts`. Search and type filters update the list. Manual Create Artifact persists and selects the new artifact. Detail viewer renders markdown, text, json, and log source safely. Run Ledger can create a run summary artifact, a markdown report artifact, or a log snapshot artifact. Sessions can create a linked session summary artifact. Board cards can create linked card summary artifacts. Artifact Shelf shows artifact history events. It can send Visual Edit, A/B Variants, and Browser Check requests through `POST /studio/runs`. The adapter unavailable state is visible and does not crash the shelf.

## Context Inspector

`GET /studio/context/current` returns active profile, model or provider, runtime, storage, workspace, context files, related work, and warnings. `GET /studio/context/runs/{run_id}` returns selected run metadata and related artifacts, cards, approvals, and sessions. `GET /studio/context/sessions/{session_id}` returns selected session metadata and related runs, artifacts, cards, and approvals. `GET /studio/context/workspaces/current` accepts a selected workspace path and discovers allowlisted project files read-only. Context routes require adapter auth and return standard error envelopes. OpenAPI route parity includes all `/studio/context/*` routes. SOUL.md, AGENTS.md, CLAUDE.md, README.md, package.json, pyproject.toml, and Cargo.toml previews are length-limited. Obvious API keys, tokens, passwords, bearer strings, and long hex secrets are redacted from previews. Workspace path traversal is rejected without crashing. Symlink context files are skipped. Missing workspace or missing files shows a useful empty or unavailable state. Context Inspector loads current context from the Context activity. Run Ledger "Inspect Context" opens run-scoped context. Sessions "Inspect Context" opens session-scoped context. Artifact detail can inspect related run or session context when linked. Linked Board cards can inspect run or session context when linked. Memory and Skills sections are clearly read-only or unavailable when not implemented. Context Inspector remains useful when Hermes runtime is unavailable by showing Studio-owned context and warnings. Context tests verify no writes to Hermes `state.db`.

## Approval Center

`GET /studio/approvals` lists Studio-owned approval history. `GET /studio/approvals/pending` lists pending approvals. `GET /studio/approvals/{approval_id}` returns detail with redacted request payload and events. `GET /studio/runs/{run_id}/approvals` filters approvals by run id. `GET /studio/sessions/{session_id}/approvals` filters approvals by session id. `POST /studio/approvals/{approval_id}/approve` records a local decision and reports whether Hermes was notified. `POST /studio/approvals/{approval_id}/deny` records a local decision and reports whether Hermes was notified. Approval routes require adapter auth and return standard error envelopes. OpenAPI route parity includes all `/studio/approvals/*` and scoped approval routes. `approval.requested` run stream events persist without breaking SSE. `approval.resolved` run stream events persist and update status and decision. Malformed approval payloads are stored with unknown fields and do not crash. Secret-like approval payload values are redacted. Approval Center shows pending, history, filters, detail, empty, and error states. Run Ledger highlights approval events and "Open Approvals" scopes the center to the selected run. Context Inspector shows related approvals for selected run or session context. Activity rail or status bar shows pending approval count. The UI clearly distinguishes local-only approval decisions from Hermes-notified decisions. Approval tests verify no writes to Hermes `state.db`.

## Status bar

The status bar shows the active profile name, working directory path, model name, pending approval count when approvals are pending, adapter connection status with a green or red dot, active theme name, and version number.

## Process management

`GET /studio/processes` lists running processes. `POST /studio/processes/start` starts a process from template. `POST /studio/processes/{process_id}/stop` stops a running process. `GET /studio/processes/{process_id}/logs` returns process output. `DELETE /studio/processes/{process_id}` removes a process record. Process cockpit shows a template grid with dev-server, adapter, test-runner, and build options. Process cards show status, uptime, and log preview. Process logs stream in real-time. Process routes require adapter auth.

## Tool packs and Extensions

`GET /studio/tool-packs` lists discovered tool packs. `GET /studio/tool-packs/{pack_id}` returns pack detail with tools. `POST /studio/tool-packs/{pack_id}/enable` enables a tool pack. `POST /studio/tool-packs/{pack_id}/disable` disables a tool pack. `POST /studio/tool-packs/validate` validates a tool pack definition. Extensions panel shows available and enabled packs. Tool pack schema validation rejects invalid definitions. The example tool pack is discoverable and functional.

## Checkpoints

`GET /studio/checkpoints` lists git commit timeline. `GET /studio/checkpoints/{checkpoint_id}` returns checkpoint detail. `POST /studio/checkpoints` creates a new checkpoint. Checkpoint timeline shows commit history with metadata. Checkpoint detail shows diff preview and related run.

## Worktrees

`GET /studio/worktrees` lists git worktrees. `GET /studio/worktrees/{worktree_id}` returns worktree detail. `POST /studio/worktrees` creates a new worktree. `DELETE /studio/worktrees/{worktree_id}` removes a worktree. Worktree launcher can open worktree in external editor.

## Delegations

`GET /studio/delegations` lists sub-agent delegations. `GET /studio/delegations/{delegation_id}` returns delegation detail. Delegation panel shows parent run, delegated task, and status. Delegation events are captured from run stream.

## Cron jobs

`GET /studio/cron-jobs` lists cron jobs from `~/.hermes/cron/`. `GET /studio/cron-jobs/{job_id}` returns job detail. Cron panel shows schedule, command, last run, and next run. Cron jobs are read-only — no create, edit, or delete from Studio.

## Security

The secret guard detects API keys, tokens, passwords, and bearer strings. Input validator rejects malformed path params, query params, and request bodies. Audit log records security-relevant operations in studio.db. DB uses WAL mode for concurrent access. Token rotation works on adapter restart. Rate limiting prevents token brute-force attempts.

## Native desktop features

System tray icon appears with Show/Hide, New Run, and Quit menu. `Ctrl+Shift+N` opens New Run modal. `Ctrl+Shift+H` shows or hides the main window. Native notification appears on run completion and on approval request. Preview Canvas opens as a second window for URL preview.

## Connection resilience

Circuit breaker opens after consecutive Hermes API failures and recovers after cooldown period. Retry with exponential backoff handles transient failures. SSE buffer respects 1MB size limit. Log rotation detection triggers reconnection. Connection caching reduces repeated health checks.

## Edge cases

Rapid prompt sending does not break state. Opening command palette during streaming pauses input. Closing adapter mid-stream shows error in chat. Restarting adapter reconnects on next health check. Empty prompt does not send.

## Logs

Bottom Logs tab shows log lines from adapter. Log lines are color-coded by level (info, warn, error). Source selector works with agent.log, errors.log, and gateway.log. Empty state shows when logs are unavailable. Secrets and API keys are redacted from log output. Log stream auto-scrolls or shows new lines.

## Profiles

Left sidebar Profiles section shows profile list. Active profile is highlighted. Profile count is shown. Clicking a profile shows "switching not implemented" notice. Status bar shows active profile name. Empty state shows when no profiles found.