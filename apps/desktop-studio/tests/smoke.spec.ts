import { test, expect } from "./fixtures/studio-fixture";

test.describe("smoke", () => {
  test("app renders the main frame", async ({ studioPage: page }) => {
    await page.locator(".app-frame").waitFor({ timeout: 30000 });
    await expect(page.locator(".app-frame")).toBeVisible();
  });

  test("top bar is visible with app title", async ({ studioPage: page }) => {
    await page.locator(".top-bar").waitFor({ timeout: 30000 });
    const topBar = page.locator(".top-bar");
    await expect(topBar).toBeVisible();
    await expect(topBar).toContainText("Hermes Studio");
  });

  test("left rail renders rail navigation", async ({ studioPage: page }) => {
    await page.locator(".rail-section-btn").first().waitFor({ timeout: 30000 });
    const railSectionBtns = page.locator(".rail-section-btn");
    await expect(railSectionBtns).toHaveCount(4);
  });

  test("center area renders with tabs", async ({ studioPage: page }) => {
    await page.locator(".center-area").waitFor({ timeout: 30000 });
    const centerArea = page.locator(".center-area");
    await expect(centerArea).toBeVisible();

    const tabs = page.locator(".center-tab");
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("status bar is visible", async ({ studioPage: page }) => {
    await page.locator(".status-bar").waitFor({ timeout: 30000 });
    const statusBar = page.locator(".status-bar");
    await expect(statusBar).toBeVisible();
  });

  test("status bar shows adapter connected", async ({ studioPage: page }) => {
    await page.locator(".status-bar").waitFor({ timeout: 30000 });
    const statusBar = page.locator(".status-bar");
    await expect(statusBar).toContainText("Connected");
  });

  test("no vite error overlay", async ({ studioPage: page }) => {
    const overlay = page.locator("#vite-error-overlay");
    await expect(overlay).not.toBeVisible();
  });
});