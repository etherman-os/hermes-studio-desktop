# Hermes logs and profiles integration

## Logs

The adapter reads four log file categories from `~/.hermes/logs/`: `agent.log` (the main agent log), `errors.log` (error entries), `gateway.log` (gateway activity), and any other `.log` files Hermes writes.

Log files are opened read-only. The adapter never creates, modifies, or deletes log files. Log streaming uses file tail — it reads only new bytes appended since the stream started.

Redaction happens automatically. Bearer tokens become `Bearer [REDACTED]`, API key patterns like `api_key=<value>` become `api_key=[REDACTED]`, secret patterns like `token=<value>`, `secret=<value>`, or `password=<value>` become `[REDACTED]`, and long hex strings (32+ characters) become `[REDACTED_HEX]`. Known key prefixes like `sk-...`, `tvly-...`, and `xai-...` are redacted as `[REDACTED_KEY]`.

If `~/.hermes/logs/` does not exist, Hermes has not written any log files yet. If a requested log file is missing, it may have been rotated or deleted — try a different source name.

The environment variables controlling this are `HERMES_HOME` (defaults to `~/.hermes`) and `HERMES_STUDIO_HERMES_HOME` (overrides the home directory when set).

---

## Profiles

The adapter discovers profiles by listing directories under `~/.hermes/profiles/`, inspecting each for `config.yaml` and `state.db`, then reading `config.yaml` to detect which profile is active. It falls back to the `HERMES_PROFILE` environment variable if the config file does not specify an active profile.

Profile operations are read-only. The adapter does not create, delete, or switch profiles — profile switching returns `501 Not Implemented`. Config files are never mutated.

If `~/.hermes/profiles/` does not exist or `~/.hermes/config.yaml` is missing, the adapter reports that no profiles were found. The "Profile switching not implemented" message is expected behavior in the current phase.

The environment variables controlling profile discovery are `HERMES_HOME` (defaults to `~/.hermes`), `HERMES_STUDIO_HERMES_HOME` (overrides the home directory when set), and `HERMES_PROFILE` (provides an explicit active profile name override).