# Adapter Contract

## Base URL

```text
http://127.0.0.1:39191
```

Desktop frontend code talks to `/studio/*` only. The root `GET /health` endpoint is public adapter/dev tooling health and is not a desktop data path.

## Auth

Protected `/studio/*` endpoints require:

```text
Authorization: Bearer <token>
```

Token sources:

- Tauri desktop: reads `~/.hermes-local-shell/runtime/token` through the Rust command bridge and keeps it in memory.
- Browser dev: set `VITE_HERMES_STUDIO_ADAPTER_TOKEN`, or copy the adapter-generated token from `~/.hermes-local-shell/runtime/token`.
- Adapter dev: set `HERMES_STUDIO_ADAPTER_TOKEN` to force a known token; otherwise the adapter generates one at startup.

The token is not stored in `localStorage`.

## Health

- `GET /studio/health` — canonical desktop frontend health endpoint, no auth.
- `GET /health` — adapter-level CLI/dev health only, no auth.

Both include `storage` diagnostics for Studio-owned `studio.db`:

```json
{
  "storage": {
    "available": true,
    "schema_version": 2,
    "data_dir": "/home/user/.local/share/hermes-desktop-studio",
    "db_path": "/home/user/.local/share/hermes-desktop-studio/studio.db",
    "last_error": null
  }
}
```

## Current `/studio/*` Endpoints

- `GET /studio/bootstrap`
- `GET /studio/profiles`
- `GET /studio/profiles/active`
- `POST /studio/profiles/activate`
- `GET /studio/sessions`
- `GET /studio/sessions/{session_id}`
- `POST /studio/runs`
- `GET /studio/runs/{run_id}/events`
- `POST /studio/runs/{run_id}/stop`
- `GET /studio/logs`
- `GET /studio/logs/stream`
- `GET /studio/model-config`
- `GET /studio/themes`
- `GET /studio/themes/active`
- `GET /studio/themes/{theme_id}`
- `POST /studio/themes/activate`
- `POST /studio/themes/reload`
- `GET /studio/kanban/boards`
- `GET /studio/kanban/boards/default`
- `GET /studio/kanban/boards/{board_id}`
- `POST /studio/kanban/cards`
- `PATCH /studio/kanban/cards/{card_id}`
- `POST /studio/kanban/cards/{card_id}/move`
- `POST /studio/kanban/cards/{card_id}/archive`
- `POST /studio/kanban/cards/{card_id}/link-session`
- `POST /studio/kanban/cards/{card_id}/link-run`
- `GET /studio/config`
- `PATCH /studio/config`

`packages/protocol/openapi.yaml` must document every implemented `/studio/*` path/method. The route parity test fails when implementation and OpenAPI drift.

## Legacy `/shell/*`

Legacy prototype `/shell/*` routes are disabled by default and are not part of the desktop contract. To mount them for reference tooling only:

```bash
HERMES_STUDIO_ENABLE_LEGACY_SHELL_ROUTES=1 pnpm run dev:adapter
```

Do not add new desktop features on `/shell/*`.

## Event Model

All Studio SSE events must match `packages/protocol/events.schema.json` and include:

```json
{
  "id": "evt_...",
  "type": "assistant.delta",
  "timestamp": "2026-05-06T00:00:00Z",
  "source": "adapter",
  "payload": {}
}
```

`run_id` and `session_id` are optional top-level fields when applicable. Unknown upstream events are normalized to `adapter.warning` or ignored safely; malformed upstream events must not weaken the Studio schema.

`kanban.updated` events must include structured payloads with at least `board_id` and `action`. Malformed upstream Kanban notifications are normalized to `adapter.warning`; persistent Kanban writes only happen through `/studio/kanban/*`.

## Error Envelope

All protected endpoint errors use:

```json
{
  "error": {
    "code": "auth_missing",
    "message": "Missing or invalid Authorization header",
    "retryable": false,
    "source": "adapter",
    "hint": "Start the adapter and initialize the desktop auth token before calling protected /studio/* endpoints."
  }
}
```

`source` is one of `adapter`, `hermes`, or `studio`.

## Read-only Guarantees

- Hermes `state.db` is opened read-only for sessions.
- Hermes logs are opened read-only and redacted before returning to the UI.
- Hermes profiles and model/provider config are inspected read-only.
- The adapter must not mutate Hermes core files unless a safe official Hermes CLI/API write path is explicitly used.
- Studio-owned persistence uses `studio.db`; it is separate from Hermes `state.db` and must not store secrets.
- Studio-owned Kanban writes go only to `studio.db`; session/run links store IDs only.
