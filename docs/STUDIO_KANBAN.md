# Studio Kanban

Hermes Desktop Studio stores Kanban workflow data in Studio-owned `studio.db`.
This is local Studio state, not Hermes Agent state.

## Scope

Phase 6C adds backend protocol and persistence only:

- `/studio/kanban/*` endpoints
- SQLite tables in `studio.db`
- default board and default columns
- repository tests and OpenAPI parity

It does not add full Kanban UI, drag-and-drop, custom provider runtime, or Hermes Agent core changes.

## Storage

Kanban tables are created by Studio storage migration `2: persistent_kanban`:

- `boards`
- `columns`
- `cards`
- `card_events`

The default board is created lazily when Kanban is first read or written. If no board exists, Studio creates:

- Inbox
- Ready
- Doing
- Blocked
- Done

Kanban data persists across adapter restarts because it is stored in `studio.db`.

## API

All Kanban calls are protected `/studio/*` calls:

- `GET /studio/kanban/boards`
- `GET /studio/kanban/boards/default`
- `GET /studio/kanban/boards/{board_id}`
- `POST /studio/kanban/cards`
- `PATCH /studio/kanban/cards/{card_id}`
- `POST /studio/kanban/cards/{card_id}/move`
- `POST /studio/kanban/cards/{card_id}/archive`
- `POST /studio/kanban/cards/{card_id}/link-session`
- `POST /studio/kanban/cards/{card_id}/link-run`

The OpenAPI route parity test fails if these paths drift from `packages/protocol/openapi.yaml`.

## Safety Rules

- Do not write Kanban data to Hermes `state.db`.
- Do not store secrets, tokens, API keys, auth headers, or passwords.
- Validate and sanitize text fields before persistence.
- Treat model output as untrusted. Model output must not write directly to Kanban without structured user or app intent.
- `kanban.updated` SSE events require structured payloads with at least `board_id` and `action`.
- Malformed upstream `kanban.updated` events are normalized to `adapter.warning`.

## Events

Kanban event payloads use `card_id`, `column_id`, and `position` for card-specific changes.
`task_id` remains a legacy optional field for compatibility only.

The backend does not mutate Kanban from arbitrary SSE payloads. SSE events are notifications; persistent changes go through `/studio/kanban/*`.

## Future Work

Future phases can add:

- Kanban Zustand store
- read UI backed by `/studio/kanban/*`
- drag-and-drop movement through `POST /studio/kanban/cards/{card_id}/move`
- concept-pack styling for semantic column states

Those phases should keep the same storage and protocol boundaries.
