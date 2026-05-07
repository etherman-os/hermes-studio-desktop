import { test as base, type Page, type BrowserContext } from "@playwright/test";
import { mockAllAdapter, injectTauriStub } from "./test-helpers";

type StudioFixtures = {
  studioPage: Page;
};

export const test = base.extend<StudioFixtures>({
  studioPage: async ({ context, page }, use) => {
    await injectTauriStub(context);
    await mockAllAdapter(page);
    await page.goto("/");
    await page.locator(".app-frame").waitFor({ timeout: 15000 });
    await use(page);
  },
});

export { expect } from "@playwright/test";
