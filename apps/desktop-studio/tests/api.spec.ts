import { test as base, expect } from "@playwright/test";
import * as mock from "./fixtures/mock-responses";
import { mockAllAdapter, injectTauriStub } from "./fixtures/test-helpers";

const BASE = "http://127.0.0.1:39191";

const test = base.extend<{}>({
  page: async ({ context, page }, use) => {
    await injectTauriStub(context);
    await use(page);
  },
});

test.describe("API route intercepts", () => {
  test("health endpoint returns mock data", async ({ page }) => {
    await page.route(`${BASE}/studio/health`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mock.HEALTH_OK) }),
    );
    await page.goto("/");
    await page.locator(".app-frame").waitFor({ timeout: 15000 });
    await expect(page.locator(".status-bar")).toContainText("Connected");
  });

  test("app renders in disconnected state without adapter mock", async ({ page }) => {
    await page.route(`${BASE}/studio/health`, (route) => route.abort());
    await page.goto("/");
    await page.locator(".app-frame").waitFor({ timeout: 15000 });
    await expect(page.locator(".app-frame")).toBeVisible();
    await expect(page.locator(".status-bar")).toContainText(/Disconnected|Auth/);
  });

  test("sessions endpoint data appears in sidebar", async ({ page }) => {
    await mockAllAdapter(page);
    await page.goto("/");
    await page.locator(".app-frame").waitFor({ timeout: 15000 });

    await page.locator(".rail-icon").nth(3).click();
    const sidebar = page.locator(".sidebar-content");
    await expect(sidebar).toContainText("Map src directory structure");
  });

  test("run ledger populates from /runs/recent", async ({ page }) => {
    await mockAllAdapter(page);
    await page.goto("/");
    await page.locator(".app-frame").waitFor({ timeout: 15000 });

    await expect(page.locator(".run-ledger")).toBeVisible();
    const recentRuns = page.locator(".recent-runs-list");
    await expect(recentRuns).toContainText("Map src directory structure");
  });

  test("status bar shows active profile name", async ({ page }) => {
    await mockAllAdapter(page);
    await page.goto("/");
    await page.locator(".app-frame").waitFor({ timeout: 15000 });

    await expect(page.locator(".status-bar")).toContainText("coder");
  });

  test("adapter 500 error shows disconnected state", async ({ page }) => {
    await page.route(`${BASE}/studio/health`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "Internal error" } }) }),
    );
    await page.goto("/");
    await page.locator(".app-frame").waitFor({ timeout: 15000 });
    await expect(page.locator(".status-bar")).toContainText(/Disconnected|Auth/);
  });
});
