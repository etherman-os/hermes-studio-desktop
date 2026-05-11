# UI direction

The desktop UI should feel like a compact operations workbench.

## Current direction

The default surface is Mission Control. Chat is a prompt panel, not the whole product. Board is a run/session/artifact control surface, not a standalone todo app. The right panel acts as an inspector for selected run, model, tools, memory, context, approvals, and diagnostics. The bottom panel is operational output: activity, tool events, logs, and adapter diagnostics. Themes provide semantic labels/icons, visual tone, and animated concept-pack ambience, but the workbench structure remains stable.

## Near-term surfaces

Near-term surfaces include the Run Ledger showing current/last run, event timeline, and selected event payload. Mission Control serves as the runtime command center for local CLI, optional gateway bridge, recent runs, approvals, processes, delegations, and capability inventory. Design Canvas imports HTML, screenshots notes, URLs, JSON specs, and markdown briefs, then sends a structured design handoff to Hermes. Artifact Shelf has categories for files, markdown, screenshots, tests, log snapshots, sanitized HTML previews, design actions, browser evidence requests, and reports. Context Inspector provides read-only active profile, model/provider, workspace files, memory/skills availability, runtime warnings, and related runs/sessions/cards/artifacts. Approval Center shows pending/history, risk/status, run/session links, local decisions, and Hermes notification state. Process Cockpit has a template grid, process cards, real-time logs, and start/stop controls. Extensions Panel has tool pack discovery, enable/disable, and pack detail with tool list. Checkpoint Timeline shows git commit history, diff previews, and checkpoint creation. Worktree Launcher has worktree list, creation, and external editor integration. Delegation Panel tracks sub-agents, parent run context, and delegation status. Cron Panel shows scheduled jobs from ~/.hermes/cron/, schedule display, and run history. Preview Canvas provides a second window for URL preview and artifact rendering.

## Guardrails

Do not make the UI a generic dashboard. Do not make Chat the main product. Do not implement drag-and-drop Kanban before the run-centered workflow is clear. Do not start animated concept-pack runtime before the workbench structure is stable. Do not hardcode example theme concepts in core components.

## Phase UX-2 shell direction

The shell should read as a desktop workbench. The top bar shows app identity, current workspace, New Run, runtime chips, and command palette. The activity rail has stable activities for Mission, Runs, Chat, Board, Sessions, Design, Artifacts, Processes, Context, Approvals, Hermes Arsenal, Delegations, Cron, Logs, Themes, and Settings. The contextual sidebar provides activity-specific navigation and actions. The center workbench keeps Run Ledger as primary with Chat as one surface. The right inspector shows runtime, selected run, model, tools, approvals, memory, and context. The bottom panel displays activity, tools, logs, and adapter diagnostics.

Runtime state must be explicit. MockBackend should never look like real Hermes. Auto fallback should show why it fell back. In local mode, Studio maps workspace path, provider/model, skills, toolsets, checkpoints, max turns, worktree, and session flags to public Hermes CLI options. When Studio sends optional run context through gateway mode, the HermesBackend must retry with a minimal payload if the installed Hermes gateway rejects those fields.

## QA runtime boundary

The real product runtime is the Tauri desktop app. Browser/Vite rendering is useful for fast frontend QA, but it is not the shipping runtime and should not drive product architecture.

Use `pnpm run tauri dev` for the desktop window. Use `pnpm run test:visual:firefox` only as an optional render smoke that verifies the shell can render in a browser and writes screenshots to `artifacts/visual-smoke/` when available.