import { test, expect } from "./fixtures/studio-fixture";

test.describe("API route intercepts", () => {
  test("app renders in disconnected state without adapter mock", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test("health endpoint returns mock data", async ({ studioPage: page }) => {
    await expect(page.locator(".status-bar")).toContainText("Connected");
  });

  test("status bar shows active profile name", async ({ studioPage: page }) => {
    await expect(page.locator(".status-bar")).toContainText("coder");
  });
});