# Run-centered workbench

Hermes Desktop Studio is a local-first agent operations workbench for Hermes Agent. It's not a chat app, not a Hermes web dashboard clone, and not a VS Code editor clone.

## Product spine

The primary unit of the product is the run.

A run is the operational record of an agent attempt: prompt, assistant stream, tool calls, approvals, logs, duration, result, artifacts, memory changes, linked session, linked board card, warnings, and eventually checkpoints or diffs.

Chat remains important, but it's one surface inside the workbench. It submits prompts and displays conversation flow. The Run Ledger owns the operational truth of what happened.

## Workbench layers

The Run Ledger is the product spine — it captures live and recent run timelines, selected event details, status, backend/model, duration, warnings, and follow-up actions. Mission Control serves as the default command center for runtime health, local CLI/gateway bridge control, recent work, approvals, processes, delegations, and capability inventory. Chat is the prompt and assistant stream surface connected to the current run. The Board acts as a control surface for runs, sessions, artifacts, and follow-up workflow. Sessions provide a read-only view into Hermes session history. Design Canvas handles design import and Hermes handoff for HTML, screenshot notes, URLs, JSON specs, and markdown briefs. The Artifact Shelf is a persistent Studio-owned landing zone for files, reports, previews, screenshots, test results, visual edit requests, browser evidence plans, and log snapshots. Context Inspector is a read-only explanation surface for profile, model/provider config, workspace files, runtime state, run/session metadata, and related Studio work. Approval Center serves as an audit, visibility, and local decision surface for tool approval requests, risk, decisions, and run/session links. Logs and Diagnostics provide adapter and Hermes observability without exposing Hermes internals to the frontend.

## Kanban positioning

Kanban is not just a todo board. It's a control surface for agent operations. Cards can link to runs, sessions, and artifacts. Persistent Kanban data belongs to Studio-owned `studio.db`, not Hermes `state.db`.

Phase UX-1 does not implement full Kanban UI or drag-and-drop. The backend is ready, but Run Ledger comes first because it defines the product spine.

Phase Product-1 adds a small workflow bridge: a run can create a Kanban card in the default Inbox and link it with `run_id` and `session_id`. The write goes only to Studio-owned `studio.db`.

Phase Product-2 makes Board a real control surface. It loads persistent Studio cards, supports create/edit/move/archive actions, and keeps run/session links visible. Drag-and-drop stays out of scope until the workflow proves it needs that interaction.

## Artifact positioning

Artifacts are persistent work outputs from runs, sessions, cards, logs, tests, reports, markdown, JSON, screenshots, HTML source, and file references. They are Studio-owned metadata in `studio.db`, not Hermes Agent state.

Artifact Shelf can preserve run summaries, markdown reports, log snapshots, session summaries, card summaries, browser evidence plans, and design imports. HTML artifacts are inspected through sanitized sandboxed previews and source text. Visual Edit and A/B Variant actions hand structured requests back to Hermes through `/studio/runs`.

## Context positioning

Context Inspector explains why a run or session may have behaved the way it did. It aggregates active profile, model/provider config, runtime status, selected workspace metadata, selected run/session metadata, related artifacts/cards, and a small allowlist of workspace context files.

Phase Product-4 keeps this read-only. Workspace files are previewed with length limits and secret redaction. Missing files, unavailable Hermes sources, memory, and skills are shown as explicit unavailable states instead of silent blanks. No Hermes `state.db`, profile, config, memory, or skill file is written.

## Approval positioning

Approval Center makes tool approval requests visible as part of the run record. It persists normalized `approval.requested` and `approval.resolved` Studio events into Studio-owned `studio.db`, shows pending/history, and links approvals back to runs and sessions.

Approval Center does not auto-approve tools, bypass Hermes approval mechanisms, or write Hermes state/config. Approve/deny routes update the local Studio audit record and notify Hermes through the local gateway when the verified approval response route is available.

## Run Ledger persistence

Run Ledger history is Studio-owned. Recent run metadata and normalized Studio event envelopes persist in `studio.db` through:

- `runs`: run id, linked session id, status, prompt preview, workspace path, start/end time, duration, backend, model, and redacted error text.
- `run_events`: normalized Studio event envelope fields for each event.
- `approvals`: redacted approval request/decision metadata linked to runs or sessions.
- `approval_events`: normalized approval audit events.

The adapter stores only Studio event envelopes after normalization. Payloads and prompt previews are redacted before persistence. Tokens, API keys, auth headers, and secret-like values must not be stored.

Hermes `state.db` remains read-only and is never used for Run Ledger writes.

Current v1 scope is recent local history. Retention is bounded in the repository and can later become a user preference. The schema leaves room for future artifact links, checkpoints, diffs, and richer result summaries without moving responsibility into Hermes core.

## Themes and concept packs

Themes and concept packs are a visual and terminology layer. They can make the studio feel different, but they are not the core value by themselves. The core value is making Hermes Agent runs understandable, inspectable, and operationally manageable.

No theme concept should be hardcoded into the core app. Concept packs remain generic, data-driven, and replaceable.

## Not cloning

Hermes Desktop Studio should not copy the Hermes web dashboard feature-for-feature. It also should not become a general code editor. It uses desktop workbench patterns because those patterns are good for long-running operations, inspection, and local-first workflows.

## Next core layers

The next core layers include Run Ledger history with workflow actions and summary export, Artifact Shelf, Context Inspector with safe local reads, checkpoint-backed artifact revisions and visual diffs, browser-in-the-loop evidence runner, click-to-selector visual editing in sanitized previews, and richer animated concept packs with local marketplace.