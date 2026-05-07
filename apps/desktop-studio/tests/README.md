# E2E Tests

Playwright-based end-to-end tests for Hermes Desktop Studio.

## Setup

```bash
pnpm test:e2e:install
```

## Running

```bash
# All tests
pnpm test:e2e

# Specific suites
pnpm test:e2e:smoke
pnpm test:e2e:flow
pnpm test:e2e:a11y
pnpm test:e2e:api

# With browser visible
pnpm test:e2e:headed

# Interactive UI mode
pnpm test:e2e:ui
```

## Structure

```
tests/
  fixtures/
    mock-responses.ts   — Adapter API response fixtures
    test-helpers.ts     — Route intercept helpers and app-ready waiter
  smoke.spec.ts         — App renders, no fatal errors
  flow.spec.ts          — Tab switching, sidebar, modals, keyboard shortcuts
  a11y.spec.ts          — axe-core accessibility checks
  api.spec.ts           — Route intercept verification, disconnected state
```

## How it works

Tests run against the Vite dev server (`pnpm dev`) which Playwright starts automatically.
All adapter API calls (`http://127.0.0.1:39191/studio/*`) are intercepted with
`page.route()` and fulfilled with mock fixtures. No real adapter is needed.

The env var `VITE_HERMES_STUDIO_ADAPTER_TOKEN` is set by `playwright.config.ts` so the
client bootstraps auth from the env source, bypassing the Tauri bridge.

## Adding new tests

1. Add mock response to `fixtures/mock-responses.ts` if needed.
2. Add route intercept helper to `fixtures/test-helpers.ts`.
3. Use `mockAllAdapter(page)` in `beforeEach` for full adapter coverage.
4. Use `waitForAppReady(page)` to wait for `.app-frame` to render.
