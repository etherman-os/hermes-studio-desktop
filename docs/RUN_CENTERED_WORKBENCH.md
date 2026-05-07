# Run-Centered Workbench

Hermes Desktop Studio is a local-first agent operations workbench for Hermes Agent. It is not a chat app, not a Hermes web dashboard clone, and not a VS Code editor clone.

## Product Spine

The primary unit of the product is the run.

A run is the operational record of an agent attempt: prompt, assistant stream, tool calls, approvals, logs, duration, result, artifacts, memory changes, linked session, linked board card, warnings, and eventually checkpoints or diffs.

Chat remains important, but it is one surface inside the workbench. It submits prompts and displays conversation flow. The Run Ledger owns the operational truth of what happened.

## Workbench Layers

| Layer | Role |
| --- | --- |
| Run Ledger | Product spine. Captures current run timeline and selected event details. |
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

## Themes and Concept Packs

Themes and concept packs are a visual and terminology layer. They can make the studio feel different, but they are not the core value by themselves. The core value is making Hermes Agent runs understandable, inspectable, and operationally manageable.

No theme concept should be hardcoded into the core app. Concept packs remain generic, data-driven, and replaceable.

## Not Cloning

Hermes Desktop Studio should not copy the Hermes web dashboard feature-for-feature. It also should not become a general code editor. It uses desktop workbench patterns because those patterns are good for long-running operations, inspection, and local-first workflows.

## Next Core Layers

- Run Ledger
- Artifact Shelf
- Context Stack Inspector
- Approval Center
- Checkpoint Timeline
- Preview Canvas
- Process Cockpit
- Richer concept packs after the workbench spine is clear
