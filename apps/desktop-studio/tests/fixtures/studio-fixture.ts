import { test as base, type Page, type BrowserContext } from "@playwright/test";
import { mockAllAdapter, injectTauriStub } from "./test-helpers";

type StudioFixtures = {
  studioPage: Page;
};

export const test = base.extend<StudioFixtures>({
  studioPage: async ({ context, page }, use) => {
    await injectTauriStub(context);
    await mockAllAdapter(page);
    // Skip the first-run wizard so AppFrame renders immediately
    await context.addInitScript(() => {
      try {
        localStorage.setItem("hermes-studio-wizard-completed", "true");
      } catch {}
    });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    // Wait for React to render something (either .app-frame or splash screen)
    // This ensures the adapter:status event has fired and startup has progressed
    await page.waitForFunction(
      () => document.querySelector(".app-frame") !== null || document.querySelector(".splash-screen") !== null || document.querySelector(".top-bar") !== null,
      { timeout: 30000 }
    ).catch(() => {});
    await use(page);
  },
});

export { expect } from "@playwright/test";