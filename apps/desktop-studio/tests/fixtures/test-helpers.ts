import type { BrowserContext, Page, Route } from "@playwright/test";
import * as mock from "./mock-responses";

const BASE = "http://127.0.0.1:39191";

function jsonRoute(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

const TAURI_STUB = `
  // Tauri v2 stub for testing
  const _cbs = new Map();
  const _eventListeners = new Map();
  let _nextId = 1;
  
  // Expose testing flags so App.tsx knows to skip StartupScreen
  window.__TESTING_FLAGS = { skipStartup: true };
  
  // Expose a trigger function the test can call after listeners register
  window.__triggerAdapterReady = () => {
    console.log('[stub] __triggerAdapterReady called, firing to', _eventListeners.size, 'listeners');
    _eventListeners.forEach((handler, eventName) => {
      try { 
        handler({ payload: { status: "ready", message: "Adapter ready" } }); 
      } catch(e) { 
        console.error('[stub] handler error for', eventName, e); 
      }
    });
  };
  
  window.__TAURI_INTERNALS__ = {
    transformCallback: (cb, once) => {
      const id = _nextId++;
      _cbs.set(id, once ? () => { cb(); _cbs.delete(id); } : cb);
      return id;
    },
    unregisterCallback: (id) => _cbs.delete(id),
    invoke: (cmd, args) => {
      if (cmd === "get_adapter_auth_token") {
        // Return a mock token so initializeAdapterAuth succeeds in test environment
        return Promise.resolve("test-mock-adapter-token-12345");
      }
      if (cmd === "get_adapter_status") {
        // Return connected status so checkConnection succeeds and AppFrame renders
        return Promise.resolve({ status: "connected", message: "Adapter connected", running: true, ready: true });
      }
      if (cmd === "ensure_adapter_running") {
        // Fire the adapter:status event asynchronously so StartupScreen's listener
        // has time to register before the event fires
        setTimeout(() => {
          const handler = _eventListeners.get("adapter:status");
          if (handler) {
            try { handler({ payload: { status: "ready", message: "Adapter ready" } }); } catch (e) { console.error('[stub]', e); }
          }
        }, 50);
        return Promise.resolve({ status: "ready", running: true, ready: true });
      }
      if (cmd === "plugin:event|listen") {
        const eventName = args?.event || 'unknown';
        const handler = args?.handler;
        if (handler) {
          _eventListeners.set(eventName, handler);
          console.log('[stub] stored listener for', eventName, 'total:', _eventListeners.size);
          // For adapter:status, immediately fire if the adapter is "ready"
          // This ensures the event fires as soon as the listener registers
          if (eventName === "adapter:status") {
            setTimeout(() => {
              try { handler({ payload: { status: "ready", message: "Adapter ready" } }); } catch (e) {}
            }, 10);
          }
        }
        return Promise.resolve({ id: _nextId++ });
      }
      if (cmd === "plugin:event|unlisten") return Promise.resolve();
      return Promise.reject(new Error('[stub] ' + cmd));
    },
    convertFileSrc: (p) => 'asset://' + p,
    metadata: { currentWindow: { label: "main" } }
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: ()=>{}, registerListener: ()=>_nextId++ };
  console.log('[stub] inited');
`;

export async function injectTauriStub(context: BrowserContext) {
  await context.addInitScript(TAURI_STUB);
}

// In the fixture, after page.goto, trigger the adapter ready
export async function triggerAdapterReady(page: Page) {
  await page.evaluate(() => {
    if (typeof (window as any).__triggerAdapterReady === 'function') {
      (window as any).__triggerAdapterReady();
    }
  });
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

export async function mockHermesInventory(page: Page) {
  await page.route(`${BASE}/studio/hermes/inventory`, (route) => jsonRoute(route, mock.HERMES_INVENTORY));
  await page.route(`${BASE}/studio/hermes/providers`, (route) =>
    jsonRoute(route, { providers: mock.HERMES_INVENTORY.providers, total: mock.HERMES_INVENTORY.providers.length }),
  );
  await page.route(`${BASE}/studio/hermes/models*`, (route) =>
    jsonRoute(route, {
      models: mock.HERMES_INVENTORY.models,
      total: mock.HERMES_INVENTORY.models.length,
      summary: mock.HERMES_INVENTORY.summary,
    }),
  );
  await page.route(`${BASE}/studio/hermes/skills`, (route) =>
    jsonRoute(route, { skills: mock.HERMES_INVENTORY.skills, total: mock.HERMES_INVENTORY.skills.length, summary: mock.HERMES_INVENTORY.summary }),
  );
  await page.route(`${BASE}/studio/hermes/mcp-servers`, (route) =>
    jsonRoute(route, { mcp_servers: mock.HERMES_INVENTORY.mcp_servers, total: mock.HERMES_INVENTORY.mcp_servers.length, summary: mock.HERMES_INVENTORY.summary }),
  );
  await page.route(`${BASE}/studio/hermes/toolsets`, (route) =>
    jsonRoute(route, { toolsets: mock.HERMES_INVENTORY.toolsets, total: mock.HERMES_INVENTORY.toolsets.length, summary: mock.HERMES_INVENTORY.summary }),
  );
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
      body: "event: run.completed\\ndata: {\"id\":\"ev-done\",\"type\":\"run.completed\",\"run_id\":\"run-abc123\",\"timestamp\":\"2026-05-06T10:01:30Z\",\"source\":\"adapter\",\"payload\":{\"run_id\":\"run-abc123\"}}\\n\\n",
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
  await mockHermesInventory(page);
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