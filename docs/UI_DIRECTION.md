# UI Direction

The desktop UI should feel like a compact operations workbench.

## Current Direction

- Default surface: Run Ledger.
- Chat is a prompt panel, not the whole product.
- Board is a run/session/artifact control surface, not a standalone todo app.
- Right panel acts as an inspector for selected run, model, tools, memory, context, approvals, and diagnostics.
- Bottom panel is operational output: activity, tool events, logs, and adapter diagnostics.
- Themes provide semantic labels/icons and visual tone, but the workbench structure remains stable.

## Near-Term Surfaces

- Run Ledger: current/last run, event timeline, selected event payload.
- Artifact Shelf: categories for files, markdown, screenshots, tests, log snapshots, HTML previews, and reports.
- Context Stack Inspector: SOUL.md, AGENTS.md, CLAUDE.md, memory, skills, references, active profile, model/provider.
- Approval Center: pending and recent approval events.
- Checkpoint Timeline and Preview Canvas come later.

## Guardrails

- Do not make the UI a generic dashboard.
- Do not make Chat the main product.
- Do not implement drag-and-drop Kanban before the run-centered workflow is clear.
- Do not start animated concept-pack runtime before the workbench structure is stable.
- Do not hardcode example theme concepts in core components.
