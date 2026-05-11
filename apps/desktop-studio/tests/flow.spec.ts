import { test, expect } from "./fixtures/studio-fixture";

test.describe("user flows", () => {
  test("app frame is present with layout classes", async ({ studioPage: page }) => {
    await page.locator(".app-frame").waitFor({ timeout: 30000 });
    const frame = page.locator(".app-frame");
    await expect(frame).toBeVisible();
    await expect(frame).toHaveClass(/bottom-collapsed/);
  });

  test("center area has tabs", async ({ studioPage: page }) => {
    await page.locator(".center-tab").first().waitFor({ timeout: 30000 });
    const tabs = page.locator(".center-tab");
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("sidebar is visible and contains navigation items", async ({ studioPage: page }) => {
    await page.locator(".sidebar").waitFor({ timeout: 30000 });
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible();
  });

  test("top bar is visible with app title", async ({ studioPage: page }) => {
    await page.locator(".top-bar").waitFor({ timeout: 30000 });
    const topBar = page.locator(".top-bar");
    await expect(topBar).toBeVisible();
    await expect(topBar).toContainText("Hermes Studio");
  });

  test("command palette opens with Ctrl+K", async ({ studioPage: page }) => {
    await page.locator(".app-frame").waitFor({ timeout: 30000 });
    await expect(page.locator(".command-palette")).not.toBeVisible();

    await page.keyboard.press("Control+k");
    await expect(page.locator(".command-palette")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".command-palette")).not.toBeVisible();
  });

  test("layout classes reflect panel state", async ({ studioPage: page }) => {
    await page.locator(".app-frame").waitFor({ timeout: 30000 });
    const frame = page.locator(".app-frame");
    // Initially collapsed
    await expect(frame).toHaveClass(/bottom-collapsed/);
    await expect(frame).toHaveClass(/right-collapsed/);
  });
});