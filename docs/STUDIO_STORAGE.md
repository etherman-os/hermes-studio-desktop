# Studio Storage

Hermes Desktop Studio owns a local SQLite database named `studio.db`.

This database is for Studio-only state such as preferences, Kanban workflow metadata, run ledger history, artifact metadata, approval history, and local-only features. It is not Hermes Agent state, and it must never replace or mutate Hermes `state.db`.

## Location

Storage path priority:

1. `HERMES_STUDIO_HOME` if set
2. Platform user data directory for `hermes-desktop-studio`
3. Linux fallback: `~/.local/share/hermes-desktop-studio/`

The database file is:

```text
<studio data dir>/studio.db
```

For advanced local testing, `HERMES_STUDIO_DB_PATH` may point directly to a file named `studio.db`. The adapter rejects paths that point at Hermes `state.db`, including `~/.hermes/state.db`.

## Schema

Migration `1: initial_studio_storage` creates:

- `migrations(version integer primary key, name text not null, applied_at text not null)`
- `studio_meta(key text primary key, value text not null, updated_at text not null)`

Migration `2: persistent_kanban` creates Studio-owned Kanban tables:

- `boards`
- `columns`
- `cards`
- `card_events`

Migration `3: persistent_run_ledger` creates Studio-owned Run Ledger tables:

- `runs`
- `run_events`

Migration `4: run_workspace_metadata` adds:

- `runs.workspace_path`

Migration `5: persistent_artifacts` creates Studio-owned Artifact Shelf tables:

- `artifacts`
- `artifact_events`

Migration `6: persistent_approvals` creates Studio-owned Approval Center tables:

- `approvals`
- `approval_events`

Migration `7: persistent_processes` creates Studio-owned Process Management tables:

- `processes`
- `process_events`

Migration `8: persistent_tool_packs` creates Studio-owned Tool Pack tables:

- `tool_packs`
- `tool_pack_tools`

Migration `9: persistent_checkpoints` creates Studio-owned Checkpoint tables:

- `checkpoints`
- `checkpoint_events`

Migration `10: persistent_worktrees` creates Studio-owned Worktree tables:

- `worktrees`

Migration `11: persistent_delegations` creates Studio-owned Delegation tables:

- `delegations`
- `delegation_events`

Migration `12: persistent_cron_jobs` creates Studio-owned Cron tables:

- `cron_jobs`

Migration `13: audit_logging` creates Studio-owned Audit tables:

- `audit_log`

Migration `14: connection_cache` creates connection resilience tables:

- `connection_cache`

The migrations write metadata such as `schema_version`, `initialized_at`, and `storage_owner`.

Migrations are idempotent. Reopening `studio.db` does not duplicate migration records.

## Safety Rules

- Do not write to Hermes `state.db`.
- Do not store secrets, tokens, API keys, auth headers, or passwords.
- Keep Hermes runtime data and Studio-owned data separate.
- Use migrations for schema changes.
- Treat paths exposed by health/bootstrap as diagnostics. The frontend should not display full paths unless the user is troubleshooting.

## Health and Bootstrap

`GET /studio/health`, root `GET /health`, and `GET /studio/bootstrap` include:

```json
{
  "storage": {
    "available": true,
    "schema_version": 6,
    "data_dir": "/home/user/.local/share/hermes-desktop-studio",
    "db_path": "/home/user/.local/share/hermes-desktop-studio/studio.db",
    "last_error": null
  }
}
```

If the database is corrupt or cannot be opened, `storage.available` is `false` and `storage.last_error` contains the diagnostic message. The adapter should continue to serve read-only Hermes data where possible.

## Kanban Use

Phase 6C Kanban persistence uses this storage foundation. Kanban tables remain Studio-owned unless Hermes exposes an official workflow persistence API later. See [STUDIO_KANBAN.md](STUDIO_KANBAN.md).

## Run Ledger Use

Phase Product-1 stores recent run metadata and normalized Studio event envelopes in `studio.db`. Prompt previews and event payloads are redacted before storage. Run history remains Studio-owned and must not write to Hermes `state.db`.

Run Ledger tables support current local workflow actions and future artifacts, checkpoints, diffs, and result summaries. Phase UX-2 adds `workspace_path` as Studio-side run metadata for project-folder orientation. It is not forwarded to Hermes unless an official Hermes runtime field is verified.

## Artifact Shelf Use

Phase Product-3 stores artifact metadata and small text outputs in `studio.db`. Artifact records can link to runs, sessions, and Kanban cards. File artifacts are path references only; Studio does not copy arbitrary large files into SQLite. HTML artifacts are shown as inert source text until a sanitizer-backed Preview Canvas exists. See [STUDIO_ARTIFACTS.md](STUDIO_ARTIFACTS.md).

## Context Inspector Use

Phase Product-4 reads Studio-owned run, artifact, and Kanban metadata from `studio.db` to build context snapshots. It does not add write tables of its own in v1 and does not mutate Hermes `state.db`, Hermes config, memory, or skills. Workspace file previews are read directly from the selected workspace with strict allowlists, length limits, and redaction. See [CONTEXT_INSPECTOR.md](CONTEXT_INSPECTOR.md).

## Approval Center Use

Phase Product-5 stores redacted approval request/decision metadata in `studio.db` when normalized run stream events include `approval.requested` or `approval.resolved`. Approval Center is read-only in v1 and does not answer approvals, bypass Hermes approval mechanisms, or write Hermes `state.db`. See [APPROVAL_CENTER.md](APPROVAL_CENTER.md).

## Troubleshooting

- Set `HERMES_STUDIO_HOME=/tmp/hermes-studio-test` to test with an isolated data directory.
- Delete only Studio-owned `studio.db` if you need to reset local Studio state.
- Do not delete or edit `~/.hermes/state.db` for Studio troubleshooting.
- If `storage.available` is false, check file permissions and whether `studio.db` contains valid SQLite data.
