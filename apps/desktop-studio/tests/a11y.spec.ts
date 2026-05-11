import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures/studio-fixture";

test.describe("accessibility smoke", () => {
  test("main studio shell has no critical axe violations", async ({ studioPage: page }) => {
    // Ensure the main app frame is visible before running axe
    await page.locator(".app-frame").waitFor({ timeout: 30000 });
    await expect(page.locator(".app-frame")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const critical = results.violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });

  test("primary workbench regions are reachable by role", async ({ studioPage: page }) => {
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.locator(".center-area")).toBeVisible();
  });
});
