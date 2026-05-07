import type { BrowserContext, Page, Route } from "@playwright/test";
import * as mock from "./mock-responses";

const BASE = "http://127.0.0.1:39191";

function jsonRoute(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

const TAURI_STUB = `
  if (!window.__TAURI_INTERNALS__) {
    const _callbacks = new Map();
    let _nextCbId = 1;
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
        windows: [{ label: "main" }],
        webviews: [{ label: "main" }],
      },
      transformCallback: function(cb, once) {
        const id = _nextCbId++;
        if (once) {
          _callbacks.set(id, function() { cb.apply(null, arguments); _callbacks.delete(id); });
        } else {
          _callbacks.set(id, cb);
        }
        return id;
      },
      unregisterCallback: function(id) {
        _callbacks.delete(id);
      },
      invoke: function(cmd, args) {
        return Promise.reject(new Error('[test-stub] Tauri invoke not available: ' + cmd));
      },
      convertFileSrc: function(filePath, protocol) {
        return 'asset://' + filePath;
      },
    };
  }
  if (!window.__TAURI_EVENT_PLUGIN_INTERNALS__) {
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: function() {},
      registerListener: function() {},
    };
  }
`;

export async function injectTauriStub(context: BrowserContext) {
  await context.addInitScript(TAURI_STUB);
}

export async function mockAdapterHealth(page: Page) {
  await page.route(`${BASE}/studio/health`, (route) => jsonRoute(route, mock.HEALTH_OK));
}

export async function mockBootstrap(page: Page) {
  await page.route(`${BASE}/studio/bootstrap`, (route) => jsonRoute(route, mock.BOOTSTRAP));
}

export async function mockProfiles(page: Page) {
  await page.route(`${BASE}/studio/profiles`, (route) => jsonRoute(route, mock.PROFILES));
  await page.route(`${BASE}/studio/profiles/active`, (route) => jsonRoute(route, mock.ACTIVE_PROFILE));
}

export async function mockSessions(page: Page) {
  await page.route(`${BASE}/studio/sessions`, (route) => jsonRoute(route, mock.SESSIONS));
  await page.route(`${BASE}/studio/sessions/s-1`, (route) => jsonRoute(route, mock.SESSION_DETAIL));
}

export async function mockRuns(page: Page) {
  await page.route(`${BASE}/studio/runs/recent*`, (route) => jsonRoute(route, mock.RUNS_RECENT));
  await page.route(`${BASE}/studio/runs/run-abc123`, (route) => jsonRoute(route, mock.RUN_LEDGER));
  await page.route(`${BASE}/studio/runs/run-abc123/ledger`, (route) => jsonRoute(route, mock.RUN_LEDGER));
}

export async function mockApprovals(page: Page) {
  await page.route(`${BASE}/studio/approvals`, (route) => jsonRoute(route, mock.APPROVALS));
  await page.route(`${BASE}/studio/approvals/pending`, (route) => jsonRoute(route, mock.PENDING_APPROVALS));
  await page.route(`${BASE}/studio/approvals/appr-1`, (route) =>
    jsonRoute(route, { ...mock.APPROVALS.approvals[0], status: "pending" }),
  );
  await page.route(`${BASE}/studio/approvals/appr-1/approve`, (route) =>
    jsonRoute(route, { ...mock.APPROVALS.approvals[0], status: "approved" }),
  );
  await page.route(`${BASE}/studio/approvals/appr-1/deny`, (route) =>
    jsonRoute(route, { ...mock.APPROVALS.approvals[0], status: "denied" }),
  );
}

export async function mockArtifacts(page: Page) {
  await page.route(`${BASE}/studio/artifacts*`, (route) => jsonRoute(route, mock.ARTIFACTS));
}

export async function mockContext(page: Page) {
  await page.route(`${BASE}/studio/context/**`, (route) => jsonRoute(route, mock.CONTEXT));
  await page.route(`${BASE}/studio/context/current*`, (route) => jsonRoute(route, mock.CONTEXT));
}

export async function mockLogs(page: Page) {
  await page.route(`${BASE}/studio/logs*`, (route) => jsonRoute(route, mock.LOGS));
}

export async function mockThemes(page: Page) {
  await page.route(`${BASE}/studio/themes`, (route) => jsonRoute(route, mock.THEMES));
  await page.route(`${BASE}/studio/themes/active`, (route) => jsonRoute(route, mock.THEME_DATA));
  await page.route(`${BASE}/studio/themes/default-dark`, (route) => jsonRoute(route, mock.THEME_DATA));
  await page.route(`${BASE}/studio/themes/activate`, (route) => jsonRoute(route, { id: "default-dark", name: "Default Dark" }));
  await page.route(`${BASE}/studio/themes/reload`, (route) => jsonRoute(route, { reloaded: true, count: 2 }));
}

export async function mockConfig(page: Page) {
  await page.route(`${BASE}/studio/config`, (route) => jsonRoute(route, mock.CONFIG));
}

export async function mockModelConfig(page: Page) {
  await page.route(`${BASE}/studio/model-config`, (route) => jsonRoute(route, mock.MODEL_CONFIG));
}

export async function mockKanban(page: Page) {
  await page.route(`${BASE}/studio/kanban/boards`, (route) => jsonRoute(route, mock.KANBAN_BOARDS));
  await page.route(`${BASE}/studio/kanban/boards/default`, (route) => jsonRoute(route, mock.KANBAN_BOARD));
  await page.route(`${BASE}/studio/kanban/boards/board-1`, (route) => jsonRoute(route, mock.KANBAN_BOARD));
}

export async function mockProcesses(page: Page) {
  await page.route(`${BASE}/studio/processes`, (route) => jsonRoute(route, mock.PROCESSES));
  await page.route(`${BASE}/studio/processes/start`, (route) => jsonRoute(route, {
    id: "proc-new",
    template_id: "dev-server",
    name: "Hermes Dev Server",
    command: "pnpm run dev:desktop",
    status: "running",
    pid: 99999,
    started_at: new Date().toISOString(),
    stopped_at: null,
    exit_code: null,
    log_count: 2,
    error: null,
  }));
  await page.route(`${BASE}/studio/processes/proc-1/stop`, (route) => jsonRoute(route, {
    ...mock.PROCESSES.processes[0],
    status: "stopped",
    stopped_at: new Date().toISOString(),
  }));
  await page.route(`${BASE}/studio/processes/*/logs*`, (route) => jsonRoute(route, mock.PROCESS_LOGS));
  await page.route(`${BASE}/studio/processes/*`, (route) => jsonRoute(route, { removed: true }));
}

export async function mockRunEvents(page: Page) {
  await page.route(`${BASE}/studio/runs/*/events`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "event: run.completed\ndata: {\"id\":\"ev-done\",\"type\":\"run.completed\",\"run_id\":\"run-abc123\",\"timestamp\":\"2026-05-06T10:01:30Z\",\"source\":\"adapter\",\"payload\":{\"run_id\":\"run-abc123\"}}\n\n",
    }),
  );
}

export async function mockLogStream(page: Page) {
  await page.route(`${BASE}/studio/logs/stream*`, (route) =>
    route.fulfill({ status: 200, contentType: "text/event-stream", body: "" }),
  );
}

export async function mockAllAdapter(page: Page) {
  await mockAdapterHealth(page);
  await mockBootstrap(page);
  await mockProfiles(page);
  await mockSessions(page);
  await mockRuns(page);
  await mockApprovals(page);
  await mockArtifacts(page);
  await mockContext(page);
  await mockLogs(page);
  await mockThemes(page);
  await mockConfig(page);
  await mockModelConfig(page);
  await mockKanban(page);
  await mockProcesses(page);
  await mockRunEvents(page);
  await mockLogStream(page);
}

export async function waitForAppReady(page: Page) {
  await page.goto("/");
  await page.locator(".app-frame").waitFor({ timeout: 15000 });
}

export async function setupTestContext(page: Page) {
  await injectTauriStub(page.context());
  await mockAllAdapter(page);
}
