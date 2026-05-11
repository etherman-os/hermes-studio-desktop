# Runtime Status

Hermes Desktop Studio must make the active runtime obvious.

The desktop frontend talks only to `/studio/*`. The adapter can run in three modes:

| Mode | Behavior |
| --- | --- |
| `local` | Default. Uses the installed local `hermes` CLI directly; no gateway required. |
| `gateway` / `hermes` | Uses Hermes local API/gateway for richer SSE/API workflows. |
| `ssh` | Experimental remote VPS mode; executes Hermes through SSH against `HERMES_STUDIO_REMOTE_SSH_TARGET`. |
| `mock` | Uses `MockBackend`. Useful for UI development, but not real Hermes work. |
| `auto` | Tries local CLI first, then gateway, then Studio simulation. |

## Local Hermes Development

The normal local desktop mode does not need the Hermes gateway:

```bash
HERMES_STUDIO_BACKEND=local pnpm run dev:adapter
pnpm run tauri dev
```

CLI mode streams local Hermes stdout back into Studio and stores local run history. Run options from the Studio launcher map to public Hermes flags:

- `provider` / `model` -> `--provider` / `--model`
- `skills` -> `--skills`
- `toolsets` -> `--toolsets`
- `checkpoints` -> `--checkpoints`
- `max_turns` -> `--max-turns`
- `worktree` -> `--worktree`
- `pass_session_id` -> `--pass-session-id`

Structured tool/approval telemetry is limited by what the CLI exposes. Gateway/API mode remains optional for workflows that need richer event shapes.

## Optional Gateway/API Development

Start the Hermes API server:

```bash
API_SERVER_ENABLED=true hermes gateway --accept-hooks run
```

Start the Studio adapter in Hermes mode:

```bash
HERMES_STUDIO_BACKEND=hermes HERMES_API_BASE_URL=http://127.0.0.1:8642 pnpm run dev:adapter
```

Open the real desktop runtime:

```bash
pnpm run tauri dev
```

## UI Expectations

Runtime status appears in the top bar, right inspector, Settings sidebar, and Adapter Diagnostics bottom panel. It should show adapter/auth/storage state, backend mode, active backend, Hermes reachability, Hermes URL, active profile, and model/provider.

Mock mode must be labeled as mock. Auto fallback must show the fallback reason. Gateway mode must not silently look connected when Hermes is unreachable.

Mission Control is the primary runtime surface. It should show:

- adapter connection and active backend
- Hermes local CLI and optional gateway reachability
- the active provider/model
- recent run activity
- pending approvals
- running managed processes
- Hermes provider/model/skill/MCP/toolset counts
- local Hermes CLI version and command/flag discovery
- Hermes v0.13 checkpoint store status from `hermes checkpoints status`
- local run presets for implement/review/debug/design/browser verification/orchestration
- a secondary action to start the optional local Hermes gateway bridge process

## Remote VPS Mode

Remote mode is for users who installed Hermes on a VPS and want the desktop app to control it from their PC. Start the adapter with `HERMES_STUDIO_BACKEND=ssh` and `HERMES_STUDIO_REMOTE_SSH_TARGET=user@your-vps`. This first layer executes remote `hermes` commands through SSH. Full remote Studio parity still needs file and artifact synchronization, remote preview routing, and a stricter trust model for remote command approvals.
