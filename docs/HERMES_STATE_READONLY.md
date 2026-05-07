# Hermes State Read-Only Access

Hermes Desktop Studio reads session data from the local Hermes `state.db` in **read-only mode**. It never writes to the database.

## Files Read

| File | Purpose | Mode |
|------|---------|------|
| `state.db` | Session metadata, messages | Read-only |
| `config.yaml` | Hermes configuration (model, provider, API keys) | Read-only |
| `sessions/*.jsonl` | Session transcripts | Read-only |

## How State.db Is Located

The adapter searches for `state.db` under the Hermes home directory:

1. `HERMES_STUDIO_HERMES_HOME/state.db`
2. `HERMES_HOME/state.db`
3. `~/.hermes/state.db`
4. `HERMES_HOME/data/state.db`
5. `HERMES_HOME/sessions/state.db`

First match wins.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HERMES_HOME` | `~/.hermes` | Standard Hermes home directory |
| `HERMES_STUDIO_HERMES_HOME` | *(none)* | Override for studio-specific Hermes home |

## Schema Detection

The adapter does **not** assume a fixed schema. It:

1. Lists all tables in the database
2. Looks for a sessions-like table (`sessions`, `session`, `conversations`, `conversation`)
3. Looks for a messages-like table (`messages`, `message`, `turns`, `turn`)
4. Looks for an FTS table (`messages_fts`, `fts_messages`, `sessions_fts`)
5. Inspects columns of detected tables
6. Maps available columns to session fields (`id`, `title`, `created_at`, `updated_at`, `message_count`, `profile`)

If the schema is unsupported (no sessions table found), the adapter returns empty results and a clear reason.

## Safety Guarantees

- **Read-only connection**: SQLite opened with `?mode=ro` URI
- **No writes**: Repository never executes INSERT, UPDATE, DELETE, or CREATE
- **No secrets exposed**: File paths are not displayed in production UI
- **Graceful fallback**: Missing/unsupported DB returns empty results, not errors
- **Locked DB handling**: SQLite operational errors are caught and logged

## Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| No state.db found | `source: "unavailable"`, empty sessions |
| DB exists but no sessions table | `source: "unavailable"`, reason logged |
| DB locked by another process | `source: "unavailable"`, error logged |
| FTS table exists | Used for search queries |
| No FTS table | LIKE fallback for search |

## Testing

Tests use fixture SQLite databases created in `/tmp`. No real Hermes state.db is required in CI.

```bash
pytest packages/hermes_adapter/tests/test_session_repository.py -v
```

## Troubleshooting

### "No sessions found"

- Check if `~/.hermes/state.db` exists
- Check if Hermes has created any sessions yet
- Try `sqlite3 ~/.hermes/state.db ".tables"` to see available tables

### "SQLite error: database is locked"

- Another process (Hermes Agent) has the DB open
- This is normal during active runs
- The adapter retries gracefully on next request

### "No sessions table found"

- The DB exists but has an unexpected schema
- Check `sqlite3 ~/.hermes/state.db ".schema"` to see table definitions
- Report the schema if you want support added
