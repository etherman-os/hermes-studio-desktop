# Architecture Redesign: 15-Tab to 4-Mode Migration

## Status
Draft — for parallel implementation agent consumption.

---

## 1. Navigation Model

### Current State: Tab-Based

The current system uses three independent navigation axes:

- **LeftRail** (icon bar, always visible): 9 core rail items + 3 system items
- **CenterArea** (tab strip): 15 `CenterTab` values, horizontally scrollable
- **LeftSidebar** (contextual panel): 19 `SidebarSection` values driven by `activeTab` + `sidebarSection`

The `layoutStore` holds `activeTab`, `sidebarSection`, and `bottomTab` as independent state keys. Clicking a rail icon sets `activeTab` and `sidebarSection` together. The CenterArea tab bar allows direct tab switching via arrow keys.

```
LeftRail click → setActiveTab(tab) + setSidebarSection(section) + showSidebar()
CenterArea tab click → setActiveTab(tab) only (sidebar stays stale)
```

**Problem**: Users navigate horizontally across 15 tabs, with no semantic grouping. The "More" section hides 8 tabs under a single icon, making discovery poor.

### Proposed State: Mode-Based

Replace the 15-tab center strip with a 4-mode segmented control at the TopBar level. Each mode owns a subset of the current tabs.

```
CREATE  │  CODE  │  AUTOMATE  │  MANAGE
───────┼────────┼────────────┼────────
mission│ runs   │ extensions │ sessions
design │ processes│ delegations│ approvals
artifacts│ checkpoints│ cron  │ profiles
board  │ worktrees │ context │ settings
chat   │           │         │
```

Each mode has:
- A primary "home" surface (the first tab in the group)
- One or more secondary surfaces accessible via sidebar navigation
- Shared contextual sidebar content that updates per active surface

**Tradeoffs vs Tab-Based**:

| Concern | Tab-based (current) | Mode-based (proposed) |
|---|---|---|
| Discoverability | Poor — "More" hides 8 tabs | Good — 4 modes, all visible |
| Navigation depth | 1 level (tabs) | 2 levels (mode → surface) |
| State complexity | `activeTab` scalar | `activeMode` + `activeSurface` |
| Backwards compat | N/A | Must preserve direct URL/access |
| Keyboard nav | Arrow keys across 15 tabs | Arrow keys across 4 modes + surface tabs |

---

## 2. Component Structure

### Current Layout Tree

```
AppFrame (flex column)
├── TopBar
├── LeftRail (fixed width icon column)
├── LeftSidebar (collapsible, ~284px default)
├── CenterArea
│   ├── .center-tabs (15-tab strip, overflow scroll)
│   └── .center-content (single active component mounted)
├── RightPanel (collapsible, ~360px default)
├── BottomPanel (collapsible, ~240px default, 3 tabs: activity/logs/diagnostics)
├── Resize handles (sidebar, right, bottom)
└── StatusBar
```

### Refactoring: LeftRail + CenterArea + ModeSwitcher

The `LeftRail` remains but changes from 12 rail items to 4 mode indicators with sub-navigation. The `CenterArea` tab strip is replaced by a `ModeSwitcher` component rendered in the TopBar (or just below it). Secondary surface switching stays via sidebar.

#### New Component Hierarchy

```
AppFrame
├── TopBar
│   └── ModeSwitcher (CREATE | CODE | AUTOMATE | MANAGE)
├── LeftRail (mode-relative icon rail)
│   ├── CREATE section: [mission, design, artifacts, board, chat]
│   ├── CODE section: [runs, processes, checkpoints, worktrees]
│   ├── AUTOMATE section: [extensions, delegations, cron, context]
│   └── MANAGE section: [sessions, approvals, profiles, settings]
│   └── (collapsed state hides rail, mode switcher stays)
├── LeftSidebar (mode-scoped contextual content)
├── CenterArea
│   ├── SurfaceTabs (surface-level tabs within a mode, 1-4 tabs)
│   └── SurfaceContent (active surface component)
├── RightPanel (unchanged — run inspector, model selector)
├── BottomPanel (unchanged — logs, activity, diagnostics)
├── Resize handles
└── StatusBar
```

#### LeftRail Refactor

Current `LeftRail` renders 9 core rail items + 3 system items as flat list. The refactor groups items by mode and shows only the active mode's items, or shows all 4 mode icons that respond to click.

**Option A — Mode icons only** (minimal change):
```tsx
// 4 rail icons, each = mode entry point
const MODE_RAIL = [
  { mode: 'create', icon: Sparkles, tooltip: 'Create' },
  { mode: 'code',   icon: Code2,    tooltip: 'Code' },
  { mode: 'automate', icon: Zap,    tooltip: 'Automate' },
  { mode: 'manage', icon: Settings, tooltip: 'Manage' },
];
```

**Option B — Full rail with mode sections** (cleaner UX):
Collapse the 15 items into 4 mode groups. When a mode is active, rail shows mode-relevant items; system items (logs, settings) persist across modes.

Recommendation: Option B. The rail already has primary/system sections — extend this pattern.

#### CenterArea Refactor

The current `CenterArea` uses `CENTER_TABS.map()` with `display: contents` trick for all 15 tabs, showing one at a time. The new design mounts only the surfaces relevant to the active mode:

```tsx
const MODE_SURFACES: Record<Mode, CenterTab[]> = {
  create:    ['mission', 'design', 'artifacts', 'board', 'chat'],
  code:      ['runs', 'processes', 'checkpoints', 'worktrees'],
  automate:  ['extensions', 'delegations', 'cron', 'context'],
  manage:    ['sessions', 'approvals', 'profiles', 'settings'],
};
```

`SurfaceTabs` within `CenterArea` shows only `MODE_SURFACES[activeMode]`. Navigation within the mode uses arrow keys across surface tabs. Clicking a different mode icon in the rail switches mode (and resets surface to mode home).

---

## 3. State Management

### Current layoutStore Shape

```typescript
interface LayoutState {
  activeTab: CenterTab;         // 15 possible values
  sidebarSection: SidebarSection; // 19 possible values
  bottomTab: BottomTab;         // 3 possible values
  sidebarCollapsed: boolean;
  showRightPanel: boolean;
  showBottomPanel: boolean;
  sidebarWidth: number;        // 220-420px
  rightPanelWidth: number;     // 280-560px
  bottomPanelHeight: number;   // 150-420px
}
```

`setActiveTab` validates against `CENTER_TABS` array (15 values). `setSidebarSection` validates against `SIDEBAR_SECTIONS` (19 values).

### Proposed layoutStore Changes

```typescript
// New type
type Mode = 'create' | 'code' | 'automate' | 'manage';

interface LayoutState {
  // NEW: top-level mode
  activeMode: Mode;
  
  // REPLACES activeTab: surface within the mode
  activeSurface: CenterTab;
  
  // KEPT: sidebar section (still needed for left sidebar content)
  sidebarSection: SidebarSection;
  
  // KEPT: everything else
  bottomTab: BottomTab;
  sidebarCollapsed: boolean;
  showRightPanel: boolean;
  showBottomPanel: boolean;
  sidebarWidth: number;
  rightPanelWidth: number;
  bottomPanelHeight: number;
  
  // NEW actions
  setActiveMode: (mode: Mode) => void;  // also resets surface to mode home
  setActiveSurface: (surface: CenterTab) => void;  // validates against mode's surfaces
  
  // KEPT: existing actions
  setActiveTab: (tab: CenterTab | string) => void;  // DEPRECATE, wraps setActiveSurface
  setSidebarSection: (section: SidebarSection | string) => void;
  // ... rest unchanged
}
```

### Mode → Surface Mapping (immutable constant)

```typescript
export const MODE_HOME_SURFACE: Record<Mode, CenterTab> = {
  create:    'mission',
  code:      'runs',
  automate:  'extensions',
  manage:    'sessions',
};

export const MODE_SURFACES: Record<Mode, readonly CenterTab[]> = {
  create:    ['mission', 'design', 'artifacts', 'board', 'chat'] as const,
  code:      ['runs', 'processes', 'checkpoints', 'worktrees'] as const,
  automate:  ['extensions', 'delegations', 'cron', 'context'] as const,
  manage:    ['sessions', 'approvals', 'profiles', 'settings'] as const,
};

export function isValidSurfaceForMode(mode: Mode, tab: CenterTab): boolean {
  return MODE_SURFACES[mode].includes(tab);
}
```

### Backwards Compatibility

The existing `setActiveTab(tab)` action must continue to work during migration. It should be preserved as:

```typescript
setActiveTab: (tab) => set((s) => {
  // Find which mode this tab belongs to
  const mode = findModeForTab(tab);
  if (mode) {
    return { activeMode: mode, activeSurface: tab };
  }
  return { activeSurface: s.activeSurface }; // no-op if tab not in any mode
});
```

This way, existing event handlers and rail click handlers that call `setActiveTab` continue working while the mode is inferred.

### Persisted State

`sidebarWidth`, `rightPanelWidth`, `bottomPanelHeight` persist to `localStorage` via existing `LAYOUT_SIZE_KEY` logic — unchanged.

`activeMode` and `activeSurface` should also be persisted for session continuity:

```typescript
const LAYOUT_PREFERENCES_KEY = "hermes-studio-layout-prefs";
// Store: { activeMode: Mode, activeSurface: CenterTab, sidebarWidth, rightPanelWidth, bottomPanelHeight }
```

---

## 4. Connection Model: adapterStore + SSE

### Current SSE Handling (studioClient.ts)

`streamRunEvents(runId, handlers)` opens a fetch to `/studio/runs/${runId}/events` with Bearer token auth. The response body is a Server-Sent Events stream. Each SSE event carries `data: {"id":"...","type":"run.started","payload":{...}}`.

`parseSSEStream(buffer)` (imported from `./sseParser`) splits the buffer on `\n\n` event boundaries, then on `data:` lines. The caller iterates parsed events, switching on `event.type`.

The two SSE streams in use:
- **Run events**: `/studio/runs/{runId}/events` — emits run lifecycle + assistant + tool + approval + kanban events
- **Log stream**: `/studio/logs/stream` — emits `log.line` events

### SSE in New Layout

The SSE model is unaffected by the navigation redesign. The `streamRunEvents` and `streamLogs` functions remain in `studioClient.ts` unchanged. What changes is how the UI subscribes:

- `RightPanel` shows the selected run's live tool events — needs `currentRunId` from `runLedgerStore`, unchanged
- `BottomPanel` log tab streams live adapter logs via `streamLogs`, unchanged
- Mode/surface switch does NOT affect SSE subscriptions; subscriptions are run-scoped, not tab-scoped

The `StudioEvent` type covers 15 event types (run.started, assistant.delta, tool.started, tool.progress, tool.completed, approval.requested, approval.resolved, run.completed, run.failed, run.cancelled, kanban.updated, memory.updated, lint.result). No changes needed to the event schema.

### adapterStore Connection Lifecycle

`adapterStore.checkConnection()` runs on mount via `AppFrame` effect. On success, it triggers loading of 10+ stores in parallel:
- `sessionStore.loadFromAdapter()`
- `profileStore.loadProfiles()`
- `logStore.loadRecent()`
- `themeStore.loadThemes()`
- `runLedgerStore.loadRecentRuns()`
- `approvalStore.loadPendingApprovals()`
- `processStore.loadProcesses()`
- `toolPackStore.loadPacks()`
- `hermesInventoryStore.loadInventory()`
- `modelStore.loadConfig()`

This loading cascade is triggered by `connected: true`. In the new layout, the same cascade applies — connection state is orthogonal to navigation mode. No changes needed.

---

## 5. Performance Considerations for Tauri + React

### Current Pain Points

1. **All 15 CenterTab components mounted always**: `CENTER_TABS.map()` renders all components with `display: contents` / `display: none`. React still reconciles all 15 component trees, even when inactive.
2. **LeftSidebar re-renders on every `sidebarSection` change**: LeftSidebar has large inline component functions (`MissionSection`, `RunsList`, `SessionsList`). Zustand selector on `sidebarSection` causes full sidebar re-render.
3. **No virtualization**: The 15-tab center strip renders all tab buttons. Acceptable at 15, but adds up with large component trees.

### New Layout Performance Strategy

1. **Mode-scoped mounting**: Only surfaces in `MODE_SURFACES[activeMode]` are rendered. Switching mode unmounts ~4-5 components and mounts ~4-5 others. Use `React.lazy` + `Suspense` for non-critical surfaces (design, artifacts, checkpoints).
2. **Memoized sidebar sections**: Each sidebar section component (RunsList, SessionsList, etc.) should be wrapped in `React.memo` or extracted to `useCallback`-stable components. Currently they are inline functions inside LeftSidebar — every render recreates them.
3. **Surface-level Zustand selectors**: Instead of `useLayoutStore((s) => s.activeTab)`, use `useLayoutStore((s) => s.activeSurface)`. This is the same value, but the refactor makes each store's selector more targeted.
4. **RightPanel stays mounted**: The inspector panel (right side) should remain mounted regardless of mode — it shows run + model info. React `key` stability prevents unnecessary remounts on mode switch.
5. **Bottom panel lazy init**: `streamLogs` AbortController is created on bottom tab "logs" activation. When bottom panel is closed, abort the stream. Current code doesn't cancel on hide — add this.
6. **Tauri window**: The app uses `@tauri-apps/api/event` for `global-shortcut:new-run` and `global-shortcut:toggle-visibility`. These listeners are set up once in `AppFrame` — no issue with mode switch.

### SSE Memory

`streamRunEvents` holds `buffer` string accumulating SSE chunks. With long runs, this buffer grows. The `parseSSEStream` function returns `remainder` for re-use — but the caller appends new chunks to the same buffer variable. For very long runs (>100k events), this could be a memory concern. Consider adding a flush on run completion.

---

## 6. Migration Path: 15-Tab to 4-Mode

### Phase 0: Preparation (add types, no behavioral change)

**Files touched**: `layoutStore.ts`, `CenterArea.tsx`

- Add `Mode` type and `MODE_SURFACES` / `MODE_HOME_SURFACE` constants
- Add `activeMode: Mode` to `LayoutState` with default `'create'`
- Add `setActiveMode` action that also sets surface to mode home
- Modify `setActiveTab` to also infer and set `activeMode`
- **No component changes yet** — `CenterArea` still renders full 15-tab strip

```typescript
// layoutStore.ts additions
type Mode = 'create' | 'code' | 'automate' | 'manage';

const MODE_HOME_SURFACE: Record<Mode, CenterTab> = {
  create: 'mission', code: 'runs', automate: 'extensions', manage: 'sessions',
};

const MODE_SURFACES: Record<Mode, readonly CenterTab[]> = {
  create:    ['mission', 'design', 'artifacts', 'board', 'chat'] as const,
  code:      ['runs', 'processes', 'checkpoints', 'worktrees'] as const,
  automate:  ['extensions', 'delegations', 'cron', 'context'] as const,
  manage:    ['sessions', 'approvals', 'profiles', 'settings'] as const,
};

function findModeForTab(tab: CenterTab): Mode | null {
  for (const [mode, surfaces] of Object.entries(MODE_SURFACES)) {
    if ((surfaces as readonly CenterTab[]).includes(tab)) return mode as Mode;
  }
  return null;
}
```

### Phase 1: ModeSwitcher component (visible, non-functional)

**Files touched**: new `ModeSwitcher.tsx`, `TopBar.tsx` or `AppFrame.tsx`

- Create `ModeSwitcher` component: 4-segment button group (CREATE | CODE | AUTOMATE | MANAGE)
- Render it in `TopBar` or just below the TopBar in `AppFrame`
- Style with mode-appropriate colors/icons
- On click: calls `setActiveMode(mode)` which updates store but does NOT yet switch surfaces (Phase 2)
- Does not replace the center tab strip yet — both coexist

```tsx
// ModeSwitcher.tsx
export function ModeSwitcher() {
  const activeMode = useLayoutStore((s) => s.activeMode);
  const setActiveMode = useLayoutStore((s) => s.setActiveMode);
  return (
    <div className="mode-switcher" role="tablist">
      {(['create', 'code', 'automate', 'manage'] as Mode[]).map((mode) => (
        <button
          key={mode}
          role="tab"
          aria-selected={activeMode === mode}
          className={`mode-tab ${activeMode === mode ? 'active' : ''}`}
          onClick={() => setActiveMode(mode)}
        >
          {mode.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

### Phase 2: Surface-level mounting (mode-aware rendering)

**Files touched**: `CenterArea.tsx`, `layoutStore.ts`

- Modify `CenterArea` to only render surfaces in `MODE_SURFACES[activeMode]`
- Remove the `CENTER_TABS.map()` with `display: contents` trick — now uses conditional render
- Add `SurfaceTabs` component showing only the active mode's surfaces
- Arrow key navigation works within mode surfaces (same pattern as current, but scoped)
- Mode switch via `ModeSwitcher` → `setActiveMode` → `activeSurface` auto-resets to mode home via `setActiveMode` implementation
- The 15-tab center strip is replaced; `PRIMARY_CENTER_TABS` constant in `CenterArea` becomes unnecessary

```tsx
// CenterArea surface tabs + conditional render
const modeSurfaces = MODE_SURFACES[activeMode];
// SurfaceTabs renders modeSurfaces.map(...)
// SurfaceContent renders only the active surface component
```

### Phase 3: LeftRail re-grouping (mode-scoped rail)

**Files touched**: `LeftRail.tsx`

- Group rail items by mode
- Show active mode items expanded, other modes as icons, or show all 4 mode entries
- Update `handleClick` to call `setActiveMode` + `setActiveSurface` together
- Remove direct `setActiveTab` calls in rail, replace with mode-aware dispatch

### Phase 4: Deprecate `setActiveTab` (cleanup)

**Files touched**: `layoutStore.ts`, any external callers

- `setActiveTab` becomes internal only (or removed if no external callers found)
- Validate via `isValidSurfaceForMode(activeMode, tab)` in `setActiveSurface`
- Remove `CENTER_TABS` constant (or keep for type references only)

### Phase 5: URL / deep-link compatibility

The current system does not use client-side routing (no React Router). Tab state is in-memory + localStorage. A mode-based system should consider adding hash-based or query-param URLs (e.g., `#mode=create&surface=artifacts`) for deep linking and refresh resilience. This is optional but recommended for production readiness.

---

## Appendix: Key File Reference

| File | Purpose | Key findings |
|---|---|---|
| `src/stores/layoutStore.ts` | Layout state (tabs, panels, sizes) | 15 `CENTER_TABS`, 19 `SIDEBAR_SECTIONS`, 3 `BOTTOM_TABS`. Persists sizes to localStorage. |
| `src/stores/adapterStore.ts` | Hermes connection + health polling | 15s polling interval. `checkConnection` awaits auth + health. Triggers 10-store load cascade on success. |
| `src/components/layout/AppFrame.tsx` | Root layout shell | Mounts all panels, manages resize handles, registers Tauri event listeners for shortcuts. |
| `src/components/layout/CenterArea.tsx` | Tab content area | `CENTER_TABS.map()` renders all 15 always. Uses `PRIMARY_CENTER_TABS` (6 items) for tab strip visibility. |
| `src/components/layout/LeftRail.tsx` | Icon navigation rail | 9 core + 3 system items. `CORE_RAIL_ITEMS` array drives rendering. |
| `src/components/layout/LeftSidebar.tsx` | Contextual sidebar | 19 section branches in a single component. Inline sub-components (MissionSection, RunsList, etc.) re-created each render. |
| `src/components/layout/RightPanel.tsx` | Run inspector + model | Reads `currentRunId` from `runLedgerStore`. Shows selected run info + model selector. Unaffected by tab changes. |
| `src/api/studioClient.ts` | HTTP client + SSE | `streamRunEvents` and `streamLogs` for SSE. Uses `parseSSEStream` from `./sseParser`. |
| `src/stores/uiStore.ts` | UI modals state | Command palette, new run modal, workspace picker. Unaffected by layout redesign. |