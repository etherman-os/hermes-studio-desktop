import { test, expect } from "./fixtures/studio-fixture";

test.describe("user flows", () => {
  test("switch center tabs", async ({ studioPage: page }) => {
    const tabs = page.locator(".center-tab");
    const tabTexts = await tabs.allTextContents();
    expect(tabTexts.length).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < Math.min(tabTexts.length, 3); i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveClass(/active/);
    }
  });

  test("rail icon switches sidebar section", async ({ studioPage: page }) => {
    const icons = page.locator(".rail-icon");
    await expect(icons).toHaveCount(15);

    for (let i = 0; i < 3; i++) {
      await icons.nth(i).click();
      await expect(icons.nth(i)).toHaveClass(/active/);
      await expect(page.locator(".sidebar")).toBeVisible();
    }
  });

  test("toggle sidebar with S button", async ({ studioPage: page }) => {
    await expect(page.locator(".sidebar")).toBeVisible();

    await page.locator('.icon-button[title="Toggle sidebar"]').click();
    await expect(page.locator(".sidebar")).not.toBeVisible();

    await page.locator('.icon-button[title="Toggle sidebar"]').click();
    await expect(page.locator(".sidebar")).toBeVisible();
  });

  test("toggle bottom panel with B button", async ({ studioPage: page }) => {
    await expect(page.locator(".bottom-panel")).toBeVisible();

    await page.locator('.icon-button[title="Toggle bottom panel"]').click();
    await expect(page.locator(".bottom-panel")).not.toBeVisible();

    await page.locator('.icon-button[title="Toggle bottom panel"]').click();
    await expect(page.locator(".bottom-panel")).toBeVisible();
  });

  test("toggle right panel with I button", async ({ studioPage: page }) => {
    await expect(page.locator(".right-panel")).toBeVisible();

    await page.locator('.icon-button[title="Toggle inspector"]').click();
    await expect(page.locator(".right-panel")).not.toBeVisible();

    await page.locator('.icon-button[title="Toggle inspector"]').click();
    await expect(page.locator(".right-panel")).toBeVisible();
  });

  test("command palette opens with Ctrl+K", async ({ studioPage: page }) => {
    await expect(page.locator(".command-palette")).not.toBeVisible();

    await page.keyboard.press("Control+k");
    await expect(page.locator(".command-palette")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".command-palette")).not.toBeVisible();
  });

  test("New Run button opens modal", async ({ studioPage: page }) => {
    await expect(page.locator(".new-run-modal")).not.toBeVisible();

    await page.getByRole("button", { name: "New Run" }).first().click();
    await expect(page.locator(".new-run-modal")).toBeVisible();

    await page.locator(".modal-backdrop").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".new-run-modal")).not.toBeVisible();
  });

  test("sessions sidebar shows loaded sessions", async ({ studioPage: page }) => {
    const sessionsIcon = page.locator(".rail-icon").nth(3);
    await sessionsIcon.click();

    const sidebar = page.locator(".sidebar-content");
    await expect(sidebar).toContainText("Map src directory structure");
    await expect(sidebar).toContainText("Review API endpoint contracts");
  });

  test("run ledger shows runs when connected", async ({ studioPage: page }) => {
    const runsIcon = page.locator(".rail-icon").first();
    await runsIcon.click();

    await expect(page.locator(".run-ledger")).toBeVisible();
    await expect(page.locator(".run-ledger-title")).toBeVisible();
  });

  test("profiles list shows in settings sidebar", async ({ studioPage: page }) => {
    const settingsIcon = page.getByRole("button", { name: "Settings" });
    await settingsIcon.click();

    const sidebar = page.locator(".sidebar-content");
    await expect(sidebar).toContainText("coder");
  });

  test("app-frame has layout classes", async ({ studioPage: page }) => {
    const frame = page.locator(".app-frame");
    await expect(frame).toHaveClass(/bottom-open/);
  });
});
