# Studio Storage

Hermes Desktop Studio owns a local SQLite database named `studio.db`.

This database is for Studio-only state such as preferences, Kanban workflow metadata, run ledger history, artifact metadata, approval history, and local-only features. It is not Hermes Agent state, and it must never replace or mutate Hermes `state.db`.

## Location

Storage path priority:

1. `HERMES_STUDIO_HOME` if set
2. Platform user data directory for `hermes-desktop-studio`
3. Linux fallback: `~/.local/share/hermes-desktop-studio/`

The database file lives at:

```
<studio data dir>/studio.db
```

For advanced local testing, `HERMES_STUDIO_DB_PATH` may point directly to a file named `studio.db`. The adapter rejects paths that point at Hermes `state.db`, including `~/.hermes/state.db`.

## Schema

Migration `1: initial_studio_storage` creates the `migrations` table (version integer primary key, name text not null, applied_at text not null) and the `studio_meta` table (key text primary key, value text not null, updated_at text not null).

Migration `2: persistent_kanban` creates Studio-owned Kanban tables: `boards`, `columns`, `cards`, and `card_events`.

Migration `3: persistent_run_ledger` creates Studio-owned Run Ledger tables: `runs` and `run_events`.

Migration `4: run_workspace_metadata` adds `runs.workspace_path`.

Migration `5: persistent_artifacts` creates Studio-owned Artifact Shelf tables: `artifacts` and `artifact_events`.

Migration `6: persistent_approvals` creates Studio-owned Approval Center tables: `approvals` and `approval_events`.

Migration `7: audit_log_table` creates Studio-owned Audit tables: `audit_log`.

Migration `8: tool_packs` creates Studio-owned Tool Pack tables: `tool_packs`.

Migration `9: artifact_revisions` creates Studio-owned artifact rollback tables: `artifact_revisions`.

Migration `10: artifact_variants` creates Studio-owned artifact comparison tables: `artifact_variant_groups` and `artifact_variants`.

Migrations write metadata such as `schema_version`, `initialized_at`, and `storage_owner`. Migrations are idempotent — reopening `studio.db` does not duplicate migration records.

## Safety rules

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
    "schema_version": 10,
    "data_dir": "/home/user/.local/share/hermes-desktop-studio",
    "db_path": "/home/user/.local/share/hermes-desktop-studio/studio.db",
    "last_error": null
  }
}
```

If the database is corrupt or cannot be opened, `storage.available` is `false` and `storage.last_error` contains the diagnostic message. The adapter continues to serve read-only Hermes data where possible.

## Kanban use

Phase 6C Kanban persistence uses this storage foundation. Kanban tables remain Studio-owned unless Hermes exposes an official workflow persistence API later. See [STUDIO_KANBAN.md](STUDIO_KANBAN.md).

## Run Ledger use

Phase Product-1 stores recent run metadata and normalized Studio event envelopes in `studio.db`. Prompt previews and event payloads are redacted before storage. Run history stays Studio-owned and must not write to Hermes `state.db`.

Run Ledger tables support current local workflow actions and future artifacts, checkpoints, diffs, and result summaries. `workspace_path` is Studio-side run metadata for project-folder orientation. HermesBackend may forward it as optional run context when supported by the installed Hermes gateway, with a minimal-payload retry fallback for older gateways.

## Artifact Shelf use

Phase Product-3 stores artifact metadata and small text outputs in `studio.db`. Artifact records can link to runs, sessions, and Kanban cards. File artifacts are path references only; Studio does not copy arbitrary large files into SQLite. HTML artifacts can be inspected in sanitized sandboxed previews and as source text. Revision snapshots and A/B variant groups are Studio-owned and can apply changes back to the source artifact through a new revision. See [STUDIO_ARTIFACTS.md](STUDIO_ARTIFACTS.md).

## Context Inspector use

Phase Product-4 reads Studio-owned run, artifact, and Kanban metadata from `studio.db` to build context snapshots. It does not add write tables of its own in v1 and does not mutate Hermes `state.db`, Hermes config, memory, or skills. Workspace file previews are read directly from the selected workspace with strict allowlists, length limits, and redaction. See [CONTEXT_INSPECTOR.md](CONTEXT_INSPECTOR.md).

## Approval Center use

Phase Product-5 stores redacted approval request/decision metadata in `studio.db` when normalized run stream events include `approval.requested` or `approval.resolved`. Approval Center records local approve/deny decisions and notifies Hermes through the local gateway when the verified route is available. It does not bypass Hermes approval mechanisms or write Hermes `state.db`. See [APPROVAL_CENTER.md](APPROVAL_CENTER.md).

## Troubleshooting

- Set `HERMES_STUDIO_HOME=/tmp/hermes-studio-test` to test with an isolated data directory.
- Delete only Studio-owned `studio.db` if you need to reset local Studio state.
- Do not delete or edit `~/.hermes/state.db` for Studio troubleshooting.
- If `storage.available` is false, check file permissions and whether `studio.db` contains valid SQLite data.