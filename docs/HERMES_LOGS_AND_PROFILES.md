# Hermes Logs and Profiles Integration

## Logs

### What Is Read

| File | Description |
|------|-------------|
| `~/.hermes/logs/agent.log` | Main agent log |
| `~/.hermes/logs/errors.log` | Error log |
| `~/.hermes/logs/gateway.log` | Gateway log |
| `~/.hermes/logs/*.log` | Any other `.log` files |

### Read-Only Guarantee

- Log files are opened read-only
- No log files are created, modified, or deleted
- Log streaming uses file tail (read new bytes only)

### Log Redaction

The following patterns are automatically redacted from log output:

- Bearer tokens: `Bearer <anything>` → `Bearer [REDACTED]`
- API keys: `api_key=<value>` → `api_key=[REDACTED]`
- Secrets: `token=<value>`, `secret=<value>`, `password=<value>` → `[REDACTED]`
- Long hex strings (32+ chars): `[REDACTED_HEX]`
- Known key prefixes: `sk-...`, `tvly-...`, `xai-...` → `[REDACTED_KEY]`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HERMES_HOME` | `~/.hermes` | Standard Hermes home |
| `HERMES_STUDIO_HERMES_HOME` | *(none)* | Override for studio |

### Troubleshooting

**"No .log files found"**
- Check if `~/.hermes/logs/` exists
- Check if Hermes has written any log files yet

**"Log file not found"**
- The requested log file may have been rotated or deleted
- Try a different source name

---

## Profiles

### What Is Read

| File | Description |
|------|-------------|
| `~/.hermes/profiles/` | Profile directories |
| `~/.hermes/config.yaml` | Active profile detection |
| `HERMES_PROFILE` env var | Active profile override |

### Profile Discovery

The adapter:
1. Lists directories under `~/.hermes/profiles/`
2. Inspects each for `config.yaml` and `state.db`
3. Reads `config.yaml` to detect active profile
4. Falls back to `HERMES_PROFILE` env var

### What Is NOT Done

- No profile creation
- No profile deletion
- No profile switching (returns 501 Not Implemented)
- No config file mutation
- No full filesystem paths exposed

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HERMES_HOME` | `~/.hermes` | Standard Hermes home |
| `HERMES_STUDIO_HERMES_HOME` | *(none)* | Override for studio |
| `HERMES_PROFILE` | *(none)* | Active profile name |

### Troubleshooting

**"No profiles found"**
- Check if `~/.hermes/profiles/` exists
- Check if `~/.hermes/config.yaml` exists

**"Profile switching not implemented"**
- This is expected in Phase 4C
- Profile activation will be added in a future phase
