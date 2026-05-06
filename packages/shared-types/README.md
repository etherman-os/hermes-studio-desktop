# shared-types

TypeScript type definitions for Hermes Desktop Studio.

## Usage

```typescript
import type {
  StudioEvent,
  EventType,
  ThemePack,
  KanbanBoard,
  LayoutPack,
  PluginManifest,
  SemanticSlot,
} from "@hermes-studio/shared-types";
```

## Files

| File | Description |
|------|-------------|
| `src/events.ts` | All 15 event types with typed payloads |
| `src/theme.ts` | Theme pack types (palette, icons, labels, semantic slots) |
| `src/kanban.ts` | Studio-owned Kanban protocol types |
| `src/layout.ts` | Layout pack types (panels, tabs, modals, shortcuts) |
| `src/plugin.ts` | Plugin manifest types (active + future types) |
| `src/index.ts` | Barrel export of all types |
