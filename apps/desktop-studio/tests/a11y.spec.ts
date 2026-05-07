import { test, expect } from "./fixtures/studio-fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("accessibility", () => {
  test("home page has no critical a11y violations", async ({ studioPage: page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    if (critical.length > 0) {
      console.log(
        "A11y violations:\n" +
          critical
            .map((v) => `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`)
            .join("\n"),
      );
    }

    expect(critical).toHaveLength(0);
  });

  test("rail icons are accessible", async ({ studioPage: page }) => {
    const results = await new AxeBuilder({ page })
      .include(".rail")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const violations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(violations).toHaveLength(0);
  });

  test("top bar has no serious violations", async ({ studioPage: page }) => {
    const results = await new AxeBuilder({ page })
      .include(".top-bar")
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(serious).toHaveLength(0);
  });

  test("buttons have accessible names", async ({ studioPage: page }) => {
    const buttons = page.locator("button");
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const visible = await btn.isVisible();
      if (!visible) continue;

      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute("aria-label");
      const title = await btn.getAttribute("title");
      const hasAccessibleName = (text?.trim().length ?? 0) > 0 || !!ariaLabel || !!title;
      expect(hasAccessibleName, `Button at index ${i} lacks accessible name`).toBe(true);
    }
  });
});
