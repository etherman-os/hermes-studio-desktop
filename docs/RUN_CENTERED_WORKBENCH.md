# Run-Centered Workbench

Hermes Desktop Studio is a local-first agent operations workbench for Hermes Agent. It is not a chat app, not a Hermes web dashboard clone, and not a VS Code editor clone.

## Product Spine

The primary unit of the product is the run.

A run is the operational record of an agent attempt: prompt, assistant stream, tool calls, approvals, logs, duration, result, artifacts, memory changes, linked session, linked board card, warnings, and eventually checkpoints or diffs.

Chat remains important, but it is one surface inside the workbench. It submits prompts and displays conversation flow. The Run Ledger owns the operational truth of what happened.

## Workbench Layers

| Layer | Role |
| --- | --- |
| Run Ledger | Product spine. Captures live and recent run timelines, selected event details, status, backend/model, duration, warnings, and follow-up actions. |
| Chat | Prompt and assistant stream surface connected to the current run. |
| Board | Control surface for runs, sessions, artifacts, and follow-up workflow. |
| Sessions | Read-only view into Hermes session history. |
| Artifact Shelf | Future landing zone for files, reports, previews, screenshots, test results, and log snapshots. |
| Context Stack Inspector | Shows the context that shaped the run: profile, model, memory, skills, references, and repo guidance files. |
| Approval Center | Future risk gate for tool approvals and policy decisions. |
| Logs and Diagnostics | Adapter/Hermes observability without exposing Hermes internals to the frontend. |

## Kanban Positioning

Kanban is not just a todo board. It is a control surface for agent operations. Cards can link to runs, sessions, and artifacts. Persistent Kanban data belongs to Studio-owned `studio.db`, not Hermes `state.db`.

Phase UX-1 does not implement full Kanban UI or drag-and-drop. The backend is ready, but Run Ledger comes first because it defines the product spine.

Phase Product-1 adds a small workflow bridge: a run can create a Kanban card in the default Inbox and link it with `run_id` and `session_id`. The write goes only to Studio-owned `studio.db`.

Phase Product-2 makes Board a real control surface. It loads persistent Studio cards, supports create/edit/move/archive actions, and keeps run/session links visible. Drag-and-drop stays out of scope until the workflow proves it needs that interaction.

## Run Ledger Persistence

Run Ledger history is Studio-owned. Recent run metadata and normalized Studio event envelopes are persisted in `studio.db` through:

- `runs`: run id, linked session id, status, prompt preview, workspace path, start/end time, duration, backend, model, and redacted error text.
- `run_events`: normalized Studio event envelope fields for each event.

The adapter stores only Studio event envelopes after normalization. Payloads and prompt previews are redacted before persistence. Tokens, API keys, auth headers, and secret-like values must not be stored.

Hermes `state.db` remains read-only and is never used for Run Ledger writes.

Current v1 scope is recent local history. Retention is bounded in the repository and can later become a user preference. The schema leaves room for future artifact links, checkpoints, diffs, and richer result summaries without moving responsibility into Hermes core.

## Themes and Concept Packs

Themes and concept packs are a visual and terminology layer. They can make the studio feel different, but they are not the core value by themselves. The core value is making Hermes Agent runs understandable, inspectable, and operationally manageable.

No theme concept should be hardcoded into the core app. Concept packs remain generic, data-driven, and replaceable.

## Not Cloning

Hermes Desktop Studio should not copy the Hermes web dashboard feature-for-feature. It also should not become a general code editor. It uses desktop workbench patterns because those patterns are good for long-running operations, inspection, and local-first workflows.

## Next Core Layers

- Run Ledger history, workflow actions, and summary export
- Artifact Shelf
- Context Stack Inspector
- Approval Center
- Checkpoint Timeline
- Preview Canvas
- Process Cockpit
- Richer concept packs after the workbench spine is clear
