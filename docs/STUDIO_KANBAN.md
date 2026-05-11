# Studio Kanban

Hermes Desktop Studio stores Kanban workflow data in Studio-owned `studio.db`.
This is local Studio state, not Hermes Agent state.

## Scope

Phase 6C adds backend protocol and persistence:

- `/studio/kanban/*` endpoints
- SQLite tables in `studio.db`
- default board and default columns
- repository tests and OpenAPI parity

It does not add drag-and-drop, custom provider runtime, cloud sync, or Hermes Agent core changes.

Phase Product-1 adds one narrow workflow action from the Run Ledger: "Create Card from Run" creates a card in the default Inbox and sets `run_id` plus `session_id` when available. This still goes through `/studio/kanban/cards` and writes only to Studio-owned `studio.db`.

Phase Product-2 connects the desktop Board surface to the persistent backend. The Board can load the default board, create cards, edit title/description/priority/status, move cards through explicit controls, archive cards, and show linked run/session indicators. It remains a Studio workflow surface, not a generic toy todo board.

Phase Product-3 lets Board cards create linked artifact summaries. Artifact metadata is stored in Studio-owned `studio.db` and links back with `kanban_card_id`.

Phase Product-4 lets Context Inspector surface cards related to a selected run or session. The context surface is read-only; persistent card writes still go only through `/studio/kanban/*`.

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

## Frontend Control Surface

The desktop Board uses a Zustand Kanban store backed only by `/studio/kanban/*`. Current supported actions include loading the Studio-owned default board, creating follow-up cards in a selected column, editing card title, description, priority, and status, moving cards using explicit Move to controls, archiving cards out of the active board, creating linked cards from Run Ledger runs, creating linked cards from Hermes sessions, creating linked artifacts from cards, and inspecting linked run or session context for cards that have `run_id` or `session_id`.

## Future Work

Future phases can add drag-and-drop movement using the existing `POST /studio/kanban/cards/{card_id}/move`, concept-pack styling for semantic column states, and artifact links and review or release workflow metadata. Those phases should keep the same storage and protocol boundaries.
