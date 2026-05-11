# Hermes state read-only access

Hermes Desktop Studio reads session data from the local Hermes `state.db` in **read-only mode**. It never writes to the database.

## Files read

| File | Purpose | Mode |
|------|---------|------|
| `state.db` | Session metadata, messages | Read-only |
| `config.yaml` | Hermes configuration (model, provider, API keys) | Read-only |
| `sessions/*.jsonl` | Session transcripts | Read-only |

## How state.db is located

The adapter searches for `state.db` under the Hermes home directory:

1. `HERMES_STUDIO_HERMES_HOME/state.db`
2. `HERMES_HOME/state.db`
3. `~/.hermes/state.db`
4. `HERMES_HOME/data/state.db`
5. `HERMES_HOME/sessions/state.db`

First match wins.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HERMES_HOME` | `~/.hermes` | Standard Hermes home directory |
| `HERMES_STUDIO_HERMES_HOME` | *(none)* | Override for studio-specific Hermes home |

## Schema detection

The adapter does not assume a fixed schema. It lists all tables in the database, looks for a sessions-like table (`sessions`, `session`, `conversations`, `conversation`), looks for a messages-like table (`messages`, `message`, `turns`, `turn`), looks for an FTS table (`messages_fts`, `fts_messages`, `sessions_fts`), inspects columns of detected tables, and maps available columns to session fields (`id`, `title`, `created_at`, `updated_at`, `message_count`, `profile`).

If the schema is unsupported (no sessions table found), the adapter returns empty results and a clear reason.

## Safety guarantees

The SQLite connection is read-only with `?mode=ro` URI. The repository never executes INSERT, UPDATE, DELETE, or CREATE. File paths are not displayed in production UI. Missing or unsupported DB returns empty results, not errors. SQLite operational errors are caught and logged.

## Fallback behavior

If no state.db is found, the adapter returns `source: "unavailable"` with empty sessions. If the DB exists but has no sessions table, it returns `source: "unavailable"` and logs the reason. If the DB is locked by another process, it returns `source: "unavailable"` and logs the error. If an FTS table exists, it is used for search queries. Otherwise, LIKE fallback is used for search.

## Testing

Tests use fixture SQLite databases created in `/tmp`. No real Hermes state.db is required in CI.

Run tests with `pytest packages/hermes_adapter/tests/test_session_repository.py -v`.

## Troubleshooting

### No sessions found

Check if `~/.hermes/state.db` exists. Check if Hermes has created any sessions yet. Try `sqlite3 ~/.hermes/state.db ".tables"` to see available tables.

### SQLite error: database is locked

Another process (Hermes Agent) has the DB open. This is normal during active runs. The adapter retries gracefully on next request.

### No sessions table found

The DB exists but has an unexpected schema. Check `sqlite3 ~/.hermes/state.db ".schema"` to see table definitions. Report the schema if you want support added.