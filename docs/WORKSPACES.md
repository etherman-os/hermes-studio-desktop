# Studio Workspaces

A Studio workspace is a local project folder/path used as context for starting a new run.

Phase UX-2 keeps workspaces deliberately small. The selected workspace path appears in the top bar and status bar. Manual path selection happens through the Workspace picker. The recent workspace list stores locally in the desktop frontend. The New Run modal includes workspace path. The Run Ledger displays persisted workspace metadata. Context Inspector discovers a small allowlist of workspace files read-only.

Workspace paths are Studio-owned metadata in `studio.db`. They are not written to Hermes `state.db`.

## Hermes Runtime Boundary

The adapter treats workspace path as Studio-owned metadata first. In default local CLI mode, Studio uses the workspace as the process working directory when it exists locally. When starting a run against a reachable Hermes gateway, HermesBackend includes optional Studio run context fields that are useful in a desktop workflow:

- `workspace_path`
- `mode`
- `provider`
- `model`
- `skills`
- `toolsets`
- `checkpoints`
- `max_turns`
- `worktree`
- `pass_session_id`

In local CLI mode these map to `hermes chat --query` flags where Hermes exposes them. If the installed Hermes gateway rejects those optional fields with a validation error, HermesBackend retries once with the minimal Hermes payload (`session_id` and `input`). This keeps the Studio compatible with older local Hermes installs while still using newer Hermes capabilities when available.

## New Run Flow

Select a workspace path from the top bar or New Run modal, enter a prompt, choose a run preset or mode (chat, task, review, debug, design, verify, or orchestration), optionally choose model/provider, skills, toolsets, checkpoints, worktree, max turns, a session, or a related card id, and submit through `POST /studio/runs`. The Run Ledger remains the operational record. Chat is the prompt/conversation surface.

## Context Files

Context Inspector can preview `SOUL.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `package.json`, `pyproject.toml`, and `Cargo.toml` from the selected workspace. It does not scan recursively, does not follow symlinks, rejects path traversal, limits preview size, and redacts obvious secrets.
