# protocol

API schemas and contracts for Hermes Desktop Studio.

## Files

| File | Description |
|------|-------------|
| `openapi.yaml` | Adapter API specification (all `/studio/*` endpoints) — OpenAPI 3.1 |
| `events.schema.json` | Normalized event types (15 events) — JSON Schema |
| `theme.schema.json` | Theme pack TOML schema — generic concept pack system |
| `layout.schema.json` | Layout pack TOML schema — panel geometry and configuration |
| `plugin.schema.json` | Plugin manifest schema — theme-pack, layout-pack (active), panel-pack, command-pack, kanban-pack (future) |

## Endpoint Prefix

All desktop adapter endpoints use `/studio/` prefix. `/studio/health` is the canonical frontend health endpoint. Root `/health` remains public adapter/dev tooling health only.

Legacy `/shell/` routes are disabled by default and can only be mounted with `HERMES_STUDIO_ENABLE_LEGACY_SHELL_ROUTES=1` for prototype/reference tooling. Desktop code must not call `/shell/`.

OpenAPI parity is enforced by adapter tests: every implemented `/studio/*` route must appear in `openapi.yaml`.

## Event System

Events are normalized by the adapter. The desktop UI must never consume raw Hermes SSE events directly. Every emitted Studio event includes `id`, `type`, `timestamp`, `source`, and `payload`; `run_id` and `session_id` are optional top-level fields. The adapter may synthesize events such as `run.failed` or `adapter.warning` when Hermes signaling is ambiguous.

## Theme System

The theme system is generic and semantic-slot-based. No concept (Minecraft, Minions, LOTR, etc.) is hardcoded into the schemas. Themes map stable semantic keys to their own visual language.

## Studio Storage

Health and bootstrap responses include Studio-owned storage status for `studio.db`. This database is separate from Hermes Agent `state.db` and is intended for Studio preferences, workflow metadata, Kanban, and local-only features. It must not store secrets.

## Kanban Protocol

Persistent Kanban backend calls live under `/studio/kanban/*` and use Studio-owned `studio.db`. The backend creates a default board and default columns lazily. Full UI wiring and drag-and-drop are later phases.

## Plugin Types

| Type | MVP Status | Description |
|------|-----------|-------------|
| `theme-pack` | Active | Colors, icons, labels, styles |
| `layout-pack` | Active | Panel geometry, visibility, density |
| `panel-pack` | Future | Custom panel components |
| `command-pack` | Future | Custom commands for palette |
| `kanban-pack` | Future | Custom kanban views and workflows |
