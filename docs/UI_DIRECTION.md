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

## QA Runtime Boundary

The real product runtime is the Tauri desktop app. Browser/Vite rendering is useful for fast frontend QA, but it is not the shipping runtime and should not drive product architecture.

Use `pnpm run tauri dev` for the desktop window. Use `pnpm run test:visual:firefox` only as an optional render smoke that verifies the shell can render in a browser and writes screenshots to `artifacts/visual-smoke/` when available.
