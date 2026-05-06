# Hermes Runtime Compatibility

Phase 6C.5 validated Hermes Desktop Studio against the locally installed Hermes Agent runtime.

## Runtime Tested

| Item | Observed value |
| --- | --- |
| Binary | `~/.local/bin/hermes` |
| Version | `Hermes Agent v0.12.0 (2026.4.30)` |
| Project | `~/.hermes/hermes-agent` |
| Python | `3.11.15` |
| OpenAI SDK | `2.31.0` |

Do not persist raw output from broad diagnostic commands. On this runtime, `hermes status --all` can print configured provider secret values.

## CLI Surface

Verified read-only help commands:

```bash
which hermes
hermes --version
hermes --help
hermes config --help
hermes gateway --help
hermes model --help
hermes sessions --help
hermes logs --help
hermes dashboard --help
hermes acp --help
```

Observed top-level commands include `chat`, `model`, `fallback`, `gateway`, `setup`, `sessions`, `dashboard`, and `logs`. There is no direct `hermes api` command in this runtime.

Observed subcommands:

| Command | Subcommands/options verified from help |
| --- | --- |
| `hermes config` | `show`, `edit`, `set`, `path`, `env-path`, `check`, `migrate` |
| `hermes gateway` | `run`, `start`, `stop`, `restart`, `status`, `install`, `uninstall`, `setup`, `migrate-legacy`; supports `--accept-hooks` |
| `hermes model` | Interactive provider/model selection; no API server start command |
| `hermes sessions` | `list`, `export`, `delete`, `prune`, `stats`, `rename`, `browse` |
| `hermes logs` | `agent`, `errors`, `gateway`, `list`; supports tailing/filter flags |
| `hermes dashboard` | Web UI dashboard, default host `127.0.0.1`, default port `9119` |

## API Server

The official local API server is the gateway API platform.

```bash
API_SERVER_ENABLED=true hermes gateway --accept-hooks run
```

Verified defaults and configuration:

| Setting | Value |
| --- | --- |
| Default host | `127.0.0.1` |
| Default port | `8642` |
| Local-only binding | Supported |
| API key | Optional for local-only binding |
| Network binding without key | Refused by Hermes runtime |
| Env vars | `API_SERVER_ENABLED`, `API_SERVER_HOST`, `API_SERVER_PORT`, `API_SERVER_KEY`, `API_SERVER_CORS_ORIGINS`, `API_SERVER_MODEL_NAME` |

Safe no-cost smoke command used for probing:

```bash
TMP_HOME="$(mktemp -d /tmp/hermes-api-smoke.XXXXXX)"
HERMES_HOME="$TMP_HOME" \
API_SERVER_ENABLED=true \
API_SERVER_HOST=127.0.0.1 \
API_SERVER_PORT=18642 \
hermes gateway --accept-hooks run
```

This uses an empty temporary Hermes home, local-only binding, and does not submit a model run.

## Endpoints Verified

| Endpoint | Result |
| --- | --- |
| `GET /health` | Available, returns `{"status":"ok","platform":"hermes-agent"}` |
| `GET /health/detailed` | Available, returns gateway state, platform state, active agents, pid, timestamp |
| `GET /v1/capabilities` | Available, returns `features` and `endpoints` objects |
| `GET /v1/models` | Available, OpenAI-style `{"object":"list","data":[...]}` |
| `POST /v1/runs` | Requires `input`; invalid empty body returns a no-cost 400 |
| `GET /v1/runs/{run_id}` | Returns 404 for missing run |
| `GET /v1/runs/{run_id}/events` | Returns 404 for missing run |
| `POST /v1/runs/{run_id}/stop` | Returns 404 for missing run |

No provider-backed run was submitted during this audit.

## SSE Shapes

Hermes API server SSE uses JSON in `data:` lines and puts the event name in the JSON `event` field. It does not require an SSE `event:` line.

Observed/verified source shapes from the local runtime:

```json
{"event":"message.delta","run_id":"run_example","timestamp":1778105767.0,"delta":"text"}
{"event":"tool.started","run_id":"run_example","timestamp":1778105767.1,"tool":"bash","preview":"echo hello"}
{"event":"tool.completed","run_id":"run_example","timestamp":1778105767.2,"tool":"bash","duration":0.25,"error":false}
{"event":"reasoning.available","run_id":"run_example","timestamp":1778105767.3,"text":"[sanitized]"}
{"event":"run.completed","run_id":"run_example","timestamp":1778105767.4,"output":"[sanitized]","usage":{"total_tokens":12}}
```

Studio normalizes these into `events.schema.json`. Unsupported Hermes event names become `adapter.warning` and still satisfy the Studio event schema.

## Backend Assumptions

| Current HermesBackend assumption | Actual Hermes behavior | Action |
| --- | --- | --- |
| Base URL defaults to `http://127.0.0.1:8642` | Matches runtime default | Keep |
| Bearer auth is optional | API key optional for local-only; required for network binding | Keep optional adapter-to-Hermes auth |
| `/health` status code is enough for reachability | `GET /health` returns small `status/platform` object | Keep stable Studio health shape |
| `/v1/capabilities` returns `capabilities` list | Runtime returns `features` and `endpoints` | Fixed parser |
| `/v1/models` returns OpenAI-style model list | Runtime returns `object:list` with `data` | Existing parser kept |
| `POST /v1/runs` accepts `prompt` | Runtime requires `input` | Fixed payload |
| `profile` is a run field | Not present in verified API server request schema | Adapter no longer sends it to Hermes |
| SSE event type is `type` or SSE `event:` | Runtime uses JSON `event` | Fixed normalizer and stream parser |
| `message.delta` should render as assistant text | Runtime emits `delta` text | Fixed mapping to `assistant.delta` |
| `tool.completed` uses `success/duration_ms` | Runtime uses `error` and seconds `duration` | Fixed mapping |
| Stop always returns `cancelled` | Runtime source returns `stopping` when stop is accepted | Adapter now preserves returned status |
| Hermes errors are Studio-shaped | Runtime uses OpenAI-like `error.message/type/param/code` | Fixed message extraction |

## Local Hermes Storage

Read-only audit results:

| Area | Observed structure |
| --- | --- |
| Hermes home | `~/.hermes` |
| State database | `~/.hermes/state.db` |
| Session table | `sessions` |
| Message table | `messages` |
| Logs directory | `~/.hermes/logs` |
| Log files | `agent.log`, `errors.log`, `gateway.log`, plus runtime-specific logs |
| Profiles directory | No separate `profiles` directory observed |
| Config file | `~/.hermes/config.yaml` |
| Env file | `~/.hermes/.env` present; only key names were inspected |

Verified `sessions` columns include `id`, `source`, `user_id`, `model`, `model_config`, `system_prompt`, `parent_session_id`, `started_at`, `ended_at`, `end_reason`, token counters, cost fields, `title`, and `api_call_count`.

Verified `messages` columns include `id`, `session_id`, `role`, `content`, `tool_call_id`, `tool_calls`, `tool_name`, `timestamp`, token count, finish reason, and reasoning-related fields.

The Studio audit captured the `state.db` modification time before and after schema inspection and observed no write.

## Config Shape

The local Hermes config uses a nested model shape:

```yaml
model:
  provider: provider_name
  default: model_name
  base_url: https://example.invalid/v1
providers:
  provider_name:
    base_url: https://example.invalid/v1
```

The adapter reads this shape without exposing provider secret values.

## Fixtures

Sanitized compatibility fixtures live in:

- `packages/hermes_adapter/tests/fixtures/hermes_api_health.json`
- `packages/hermes_adapter/tests/fixtures/hermes_capabilities.json`
- `packages/hermes_adapter/tests/fixtures/hermes_sse_real_sample.jsonl`

These fixtures contain request/response shapes only. They do not include provider keys, tokens, private prompts, or personal database rows.

## Known Limitations

- No real provider-backed run was submitted in this audit.
- `reasoning.available` is not a stable Studio event type; it is normalized to `adapter.warning`.
- Studio continues to expose only `/studio/*` to the frontend. Direct Hermes API details remain isolated in `HermesBackend`.
- Studio-owned persistence remains in `studio.db`; Hermes `state.db` is read-only.
