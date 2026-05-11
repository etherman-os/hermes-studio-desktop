# E2E Test Failure Analysis

**Date:** 2026-05-11
**Total Failures:** 19
**Test suites:** `smoke.spec.ts` (7 failures), `flow.spec.ts` (8 failures), `api.spec.ts` (4 failures)

---

## Root Cause Summary

| Root Cause | Count | Tests |
|---|---|---|
| **A. Adapter status event not processed** - Tauri stub event system broken; React adapter never transitions to "connected" state | 11 | smoke (4), flow (4), api (3) |
| **B. Button elements not found (cascading from A)** - app renders but rail/sidebar not populated, buttons missing | 5 | flow (4), api (1) |
| **C. Status bar assertion mismatch** - "Connected" expected but "Auth missing" / "Offline" shown | 2 | smoke (1), api (1) |
| **D. Center tabs not visible** - .center-tab.nth(1) not found (cascading from A) | 1 | flow (1) |

The root cause chain is: **A -> B, A -> C, A -> D**. The broken Tauri stub event system is the single originating defect.

---

## Root Cause A: Tauri Stub Event System Does Not Work

**Affected tests:** 14 out of 19

The Tauri stub's `plugin:event|listen` returns a fake `{ id: N }` but does not actually store the callback in a way that `__triggerAdapterReady()` can fire it. When the React adapter calls `window.__TAURI_INTERNALS__.invoke("plugin:event|listen", ...)`, it passes a callback that should receive `adapter:status` events. The stub stores it but `__triggerAdapterReady()` iterates `_cbs` which was initialized without reference to the actual Tauri callback storage.

The stub code:
```js
window.__TAURI_INTERNALS__ = {
  invoke: (cmd, args) => {
    if (cmd === "plugin:event|listen") return Promise.resolve({ id: args?.handler || _nextId++ });
    // ...
  }
};
// But __triggerAdapterReady fires _cbs, not the actual stored listeners
```

This means when the React app's `AdapterContext` subscribes to `adapter:status` events via the Tauri event plugin, the subscription succeeds but `__triggerAdapterReady()` never fires those callbacks — the callback IDs from `transformCallback` don't map to `_cbs`.

**Impact:** The app stays in "connecting" / "Offline" state. The `.app-frame` may not render or may render in disconnected state. The `BOOTSTRAP.active_profile` and other data never gets applied because the adapter never reports as "ready".

---

## Root Cause B: Rail/Sidebar Buttons Not Found (Cascading from A)

**Affected tests:** 5

```
flow-user-flows-sessions-sidebar-shows-loaded-sessions  — "More tools" button timeout
flow-user-flows-run-ledger-shows-runs-when-connected    — "Runs & History" button timeout
flow-user-flows-profiles-list-is-reachable-from-more-sidebar — "More tools" button timeout
flow-user-flows-toggle-sidebar-with-S-button           — second toggle click timeout
api-API-route-intercepts-sessions-endpoint-data-appears-in-sidebar — "Sessions" button timeout
```

The rail icons and sidebar buttons are conditionally rendered based on adapter connection state. Since the adapter never reports "ready" (Root Cause A), the sidebar may not show the navigation items the tests try to click. The tests timeout at 30s waiting for these elements.

---

## Root Cause C: Status Bar "Connected" Assertion Fails

**Affected tests:** 2

```
smoke-status-bar-shows-adapter-connected         — expected "Connected", got "Auth missing...Offline"
api-health-endpoint-returns-mock-data           — expected "Connected", got "Auth missing...Offline"
```

The mock `HEALTH_OK.backend_status` sets `hermes_connected: false`:
```js
backend_status: {
  backend_mode: "mock",
  active_backend: "mock",
  hermes_connected: false,   // <-- causes "Auth missing"
  hermes_url: "http://localhost:8080",
}
```

The app reads `hermes_connected: false` and sets status to "Offline" + shows "Auth missing". The test expects "Connected" which only appears when `adapter_status` event fires with `status: "ready"` (impossible due to Root Cause A).

---

## Root Cause D: Center Tabs Not Rendered (Cascading from A)

**Affected tests:** 1

```
flow-switch-center-tabs  — .center-tab.nth(1) not found after click
```

The center tabs are rendered based on which run/session is active. Without a properly initialized adapter (Root Cause A), the center area may not populate with tabs, so `.center-tab.nth(1)` never exists.

---

## Full Failure Index

### smoke.spec.ts (7 failures)

| # | Test | Line | Error | Root Cause |
|---|---|---|---|---|
| 1 | smoke-left-rail-renders-focused-navigation-icons | 13 | `TimeoutError: locator('.app-frame').waitFor timeout 15000ms` | **A** |
| 2 | smoke-center-area-renders-with-tabs | 20 | `TimeoutError: locator('.app-frame').waitFor timeout 15000ms` | **A** |
| 3 | smoke-status-bar-is-visible | 27 | `Expect '.status-bar' not visible (5000ms)` | **A** |
| 4 | smoke-status-bar-shows-adapter-connected | 31 | `Expect '.status-bar' toContainText "Connected", got "Auth missing...Offline"` | **C** |
| 5 | smoke-no-fatal-console-errors-on-load | 43 | `TimeoutError: locator('.app-frame').waitFor timeout 15000ms` (on reload) | **A** |

### flow.spec.ts (8 failures)

| # | Test | Line | Error | Root Cause |
|---|---|---|---|---|
| 6 | flow-switch-center-tabs | 11 | `Expect '.center-tab.nth(1)' toHaveClass /active/ — element not found` | **D** |
| 7 | flow-rail-icon-switches-sidebar-section | 21 | `TimeoutError: locator('.app-frame').waitFor timeout 15000ms` | **A** |
| 8 | flow-toggle-sidebar-with-S-button | 32 | `TimeoutError: locator('.icon-button[title="Toggle sidebar"]').click timeout` (2nd click) | **B** |
| 9 | flow-toggle-bottom-panel-with-B-button | 40 | `Expect '.bottom-panel' toBeVisible — element not found` | **A** |
| 10 | flow-toggle-right-panel-with-I-button | 50 | `Expect '.right-panel' toBeVisible — element not found` | **A** |
| 11 | flow-sessions-sidebar-shows-loaded-sessions | 77 | `TimeoutError: getByRole('button', { name: 'More tools' }) timeout` | **B** |
| 12 | flow-run-ledger-shows-runs-when-connected | 86 | `TimeoutError: getByRole('button', { name: 'Runs & History' }) timeout` | **B** |
| 13 | flow-profiles-list-is-reachable-from-more-sidebar | 93 | `TimeoutError: getByRole('button', { name: 'More tools' }) timeout` | **B** |

### api.spec.ts (4 failures)

| # | Test | Line | Error | Root Cause |
|---|---|---|---|---|
| 14 | api-health-endpoint-returns-mock-data | 27 | `Expect '.status-bar' toContainText "Connected", got "Auth missing...Offline"` | **C** |
| 15 | api-sessions-endpoint-data-appears-in-sidebar | 43 | `TimeoutError: getByRole('button', { name: 'Sessions' }) timeout` | **B** |
| 16 | api-run-ledger-populates-from-runs-recent | 51 | `TimeoutError: locator('.app-frame').waitFor timeout 15000ms` | **A** |
| 17 | api-status-bar-shows-active-profile-name | 62 | `TimeoutError: locator('.app-frame').waitFor timeout 15000ms` | **A** |

---

## Fix Priority

### Quick Fixes (1-2 changes, highest impact)

**Priority 1 — Fix the Tauri stub event system** (`tests/fixtures/test-helpers.ts`)

The `plugin:event|listen` mock must properly store callbacks so `__triggerAdapterReady()` fires them. The current implementation stores in `_cbs` but the listener's actual callback reference is not what `_cbs` holds.

```ts
// Current broken pattern:
invoke: (cmd, args) => {
  if (cmd === "plugin:event|listen") return Promise.resolve({ id: args?.handler || _nextId++ });
  // ...
}

// Fix: properly store and fire the actual callback
invoke: (cmd, args) => {
  if (cmd === "plugin:event|listen") {
    const id = _nextId++;
    const callback = args?.handler;
    _cbs.set(id, callback);
    return Promise.resolve({ id });
  }
}
```

Also `__triggerAdapterReady` must call the stored callbacks with the correct payload format the React adapter expects.

**Priority 2 — Fix `HEALTH_OK.backend_status.hermes_connected`** (`tests/fixtures/mock-responses.ts`)

```ts
// Change from:
hermes_connected: false,

// Change to:
hermes_connected: true,
```

This fixes the "Auth missing" display in tests 4 and 14.

### Medium Fixes (targeted per test)

**Priority 3 — Fix `.center-tab` active class** (`src/stores/centerAreaStore.ts` or relevant component)

Test 6 fails at `expect(tabs.nth(i)).toHaveClass(/active/)` — the tab click doesn't activate the tab. Check that the center tabs store properly handles the `.active` class on click.

**Priority 4 — Fix `.bottom-panel` / `.right-panel` toggle** (`src/components/BottomPanel.tsx` or the panel toggle handler)

Tests 9 and 10: the toggle button click doesn't show the panels. The panel visibility is controlled by a store — verify the `.icon-button[title="Toggle bottom panel"]` click properly dispatches the toggle action.

### Hard Fixes (investigation needed)

**Priority 5 — Investigate why `mockAllAdapter` causes `.app-frame` timeout in later tests**

Tests 16 and 17 (api.spec.ts) call `mockAllAdapter` yet `.app-frame` times out. This suggests either:
- The SSE mock (`mockRunEvents`, `mockLogStream`) is interfering with page load
- Route handlers are registered in an order that causes race conditions
- The `page.evaluate(() => __triggerAdapterReady())` call in api.spec.ts doesn't fire because the callback was never stored

---

## Files Involved

| File | Issues |
|---|---|
| `apps/desktop-studio/tests/fixtures/test-helpers.ts` | TAURI_STUB `plugin:event|listen` doesn't properly store/fire callbacks; `invoke` returns wrong shape |
| `apps/desktop-studio/tests/fixtures/mock-responses.ts` | `HEALTH_OK.backend_status.hermes_connected` is `false` — causes "Auth missing" |
| `apps/desktop-studio/tests/fixtures/studio-fixture.ts` | No issue — fixture correctly triggers `__triggerAdapterReady` |
| `apps/desktop-studio/tests/api.spec.ts` | api.spec.ts tests 1-2 work, tests 3-6 fail — cascade from stub |
| `apps/desktop-studio/tests/smoke.spec.ts` | All fail from stub + mock issue |
| `apps/desktop-studio/tests/flow.spec.ts` | All fail from stub + cascading button misses |
| `apps/desktop-studio/src/stores/centerAreaStore.ts` | Tab activation logic may need fix (test 6) |
| `apps/desktop-studio/src/components/BottomPanel.tsx` | Toggle may need fix (test 9) |
| `apps/desktop-studio/src/components/RightPanel.tsx` | Toggle may need fix (test 10) |

---

## Recommended Fix Order

1. Fix `test-helpers.ts` TAURI_STUB `plugin:event|listen` + `__triggerAdapterReady` callback firing
2. Fix `mock-responses.ts` `hermes_connected: false` -> `true`
3. Re-run tests — expect 14 -> ~5 remaining failures
4. Fix center tab activation (test 6)
5. Fix panel toggle handlers (tests 9, 10)
6. Remaining failures if any are likely timing-related and need `waitFor` additions