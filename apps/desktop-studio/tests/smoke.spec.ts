import { test, expect } from "./fixtures/studio-fixture";

test.describe("smoke", () => {
  test("app renders the main frame", async ({ studioPage: page }) => {
    await expect(page.locator(".app-frame")).toBeVisible();
  });

  test("top bar is visible with app title", async ({ studioPage: page }) => {
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.locator(".app-mark")).toContainText("Hermes Studio");
  });

  test("left rail renders all navigation icons", async ({ studioPage: page }) => {
    const rail = page.locator(".rail");
    await expect(rail).toBeVisible();
    const icons = rail.locator(".rail-icon");
    await expect(icons).toHaveCount(8);
  });

  test("center area renders with tabs", async ({ studioPage: page }) => {
    await expect(page.locator(".center-area")).toBeVisible();
    await expect(page.locator(".center-tabs")).toBeVisible();
    const tabs = page.locator(".center-tab");
    await expect(tabs.first()).toBeVisible();
  });

  test("status bar is visible", async ({ studioPage: page }) => {
    await expect(page.locator(".status-bar")).toBeVisible();
  });

  test("status bar shows adapter connected", async ({ studioPage: page }) => {
    await expect(page.locator(".status-bar")).toContainText("Connected");
  });

  test("no vite error overlay", async ({ studioPage: page }) => {
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  });

  test("no fatal console errors on load", async ({ studioPage: page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.reload();
    await page.locator(".app-frame").waitFor({ timeout: 15000 });
    const fatal = errors.filter((e) =>
      /cannot read properties|uncaught typeerror|uncaught referenceerror/i.test(e),
    );
    expect(fatal).toHaveLength(0);
  });
});
