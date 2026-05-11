# Context Inspector

Context Inspector v1 explains the read-only inputs that may have shaped a run, session, or workspace.

It is a Studio aggregation layer. It does not edit Hermes memory, skills, profiles, config, provider setup, or Hermes `state.db`.

## What It Shows

The normalized context snapshot includes:

- active profile
- model/provider config
- adapter/backend/runtime status
- Studio storage status
- selected workspace metadata
- selected run metadata
- selected session metadata
- discovered workspace context files
- read-only memory and skills availability states
- related artifacts
- related Kanban cards
- related approvals
- related runs and sessions
- warnings for unavailable sources, missing workspace data, redaction, or skipped unsafe files

## API

All Context Inspector calls are protected `/studio/*` calls:

- `GET /studio/context/current`
- `GET /studio/context/runs/{run_id}`
- `GET /studio/context/sessions/{session_id}`
- `GET /studio/context/workspaces/current`

`workspace_path` can be passed as a query parameter for current/workspace snapshots. The adapter validates the path before reading known files.

The OpenAPI route parity test fails if these paths drift from `packages/protocol/openapi.yaml`.

## Workspace Context Files

The adapter only checks a small allowlist under the selected workspace: `SOUL.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `package.json`, `pyproject.toml`, and `Cargo.toml`.

All reads are strictly read-only with no recursive filesystem scan, no path traversal, symlinks skipped, previews length-limited, obvious secrets redacted, and missing files treated as normal.

## Related Work

Context snapshots use Studio-owned stores to show related work:

- Run metadata and recent runs come from the Run Ledger tables in `studio.db`.
- Artifacts come from the Artifact Shelf tables in `studio.db`.
- Kanban cards come from the Board tables in `studio.db`.
- Approvals come from the Approval Center tables in `studio.db`.
- Sessions come from the existing adapter session surface, which observes Hermes state read-only when real Hermes is available.

## Security

- Do not write to Hermes `state.db`.
- Do not write Hermes config/profile files.
- Do not store secrets in `studio.db`.
- Do not display `.env` or provider secret values.
- Treat context file previews as untrusted text.
- Keep memory and skill discovery read-only until official safe surfaces are verified.

## Frontend

The Context activity opens the Context Inspector in the left sidebar. It can load:

- current context
- workspace context
- selected run context from Run Ledger
- selected session context from Sessions

Run Ledger, Sessions, Artifact Shelf, linked Board cards, and Approval Center entries can open or contribute to run/session scoped context.

## Future Work

Future phases can add durable context snapshots captured at run start, Memory Lab read-only drilldown (then editor only through safe official Hermes APIs), Skill Forge read-only discovery (then editor only through safe official Hermes APIs), a richer relationship graph for runs, sessions, artifacts, cards, and approvals, and checkpoint or diff context once those surfaces exist.
