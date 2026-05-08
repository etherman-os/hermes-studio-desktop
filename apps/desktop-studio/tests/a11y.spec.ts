import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures/studio-fixture";

test.describe("accessibility smoke", () => {
  test("main studio shell has no critical axe violations", async ({ studioPage: page }) => {
    await page.locator(".splash-screen").waitFor({ state: "detached", timeout: 3000 }).catch(() => {});

    const results = await new AxeBuilder({ page })
      .include(".app-frame")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const critical = results.violations.filter((violation) => violation.impact === "critical");
    expect(critical).toEqual([]);
  });

  test("primary workbench regions are reachable by role", async ({ studioPage: page }) => {
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Center panels" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Bottom panel" })).toBeVisible();
  });
});
