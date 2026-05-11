# Remote SSH Mode

Remote SSH mode is for users who install Hermes Agent on a VPS but want to operate it from Hermes Desktop Studio on their own PC.

This is different from the default local desktop mode:

- `local`: Hermes and Studio are on the same PC; Studio runs `hermes` directly.
- `gateway`: optional local API/SSE bridge for richer telemetry.
- `ssh`: Studio runs Hermes commands on a remote host over SSH.

## Configuration

```bash
HERMES_STUDIO_BACKEND=ssh \
HERMES_STUDIO_REMOTE_SSH_TARGET=user@your-vps \
pnpm run dev:adapter
```

Optional:

```bash
HERMES_STUDIO_REMOTE_HERMES_BIN=/home/user/.local/bin/hermes
HERMES_STUDIO_CLI_RUN_TIMEOUT=7200
```

The remote host must already have Hermes installed and authenticated.

## Current Scope

The first SSH layer supports command execution through remote `hermes` CLI. It is enough for basic run handoff and health checks.

Full remote Studio parity is a larger layer because it needs remote Hermes inventory reads, remote artifact or file reference mapping, remote preview port forwarding, remote screenshot or browser evidence collection, remote approval trust boundaries, and local or remote workspace synchronization.

## Safety

Studio never stores remote provider secrets. SSH authentication is delegated to the user's SSH setup. Do not expose Hermes gateway publicly without its own authentication and network boundary. Prefer SSH tunneling or local port forwarding for gateway or API access.
