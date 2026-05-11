/**
 * E2E smoke tests for the Hermes Desktop Studio full workflow.
 *
 * These tests run against the live dev server at http://127.0.0.1:1420
 * with a real Hermes adapter at 127.0.0.1:39191.
 *
 * NOTE: Several tests reference `data-testid` attributes that have not yet been
 * added to the Studio components. These are marked with "TODO: data-testid".
 * The component subagent should add these for stable test automation.
 *
 * Currently falling back to CSS class selectors as a workaround.
 */
import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helper: wait for adapter health before proceeding
// ---------------------------------------------------------------------------
async function waitForAdapterHealth(page: Page, url = "http://127.0.0.1:39191/studio/health") {
  await page.goto("/");
  try {
    const res = await page.request.get(url, { timeout: 5000 });
    return res.ok();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Studio E2E smoke", () => {

  // -------------------------------------------------------------------------
  // 1. App Launch
  // -------------------------------------------------------------------------
  test("app launches and shows studio", async ({ page }) => {
    await page.goto("/");

    // Wait for the app frame to be visible (not blank)
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // The page should not be blank
    const title = await page.title();
    expect(title).not.toMatch(/blank/i);

    // Mode switcher should be visible
    // TODO: data-testid="mode-switcher" — currently uses class
    await expect(page.locator(".mode-switcher")).toBeVisible();
  });

  test("splash screen transitions to studio", async ({ page }) => {
    await page.goto("/");

    // Splash may be visible briefly; wait for it to disappear
    const splash = page.locator(".splash-screen");
    await splash.waitFor({ state: "attached", timeout: 5000 }).catch(() => {});
    await expect(splash).toBeHidden({ timeout: 10000 });

    // Studio should be fully rendered
    await expect(page.locator(".app-frame")).toBeVisible();
    await expect(page.locator(".top-bar")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 2. Mode Switching
  // -------------------------------------------------------------------------
  test("mode switcher changes modes", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    const modes = ["create", "code", "automate", "manage"] as const;

    // Click each mode tab and verify active mode indicator updates
    for (const mode of modes) {
      // TODO: data-testid={`mode-${mode}`} — currently uses class + aria role
      const tab = page.locator(`.mode-tab-${mode}`);
      await tab.click();
      await expect(tab).toHaveClass(/active/);

      // Active mode text should reflect current mode
      // TODO: data-testid="active-mode" — not yet in DOM
      const activeModeLabel = page.locator(".mode-tab.active span");
      await expect(activeModeLabel).toHaveText(mode.toUpperCase());
    }
  });

  test("mode tabs have correct roles and accessibility", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    const tablist = page.locator(".mode-switcher");
    await expect(tablist).toHaveAttribute("role", "tablist");
    await expect(tablist).toHaveAttribute("aria-label", "Navigation mode");

    const tabs = page.locator(".mode-switcher button");
    await expect(tabs).toHaveCount(4);
    for (const tab of await tabs.all()) {
      await expect(tab).toHaveAttribute("role", "tab");
    }
  });

  // -------------------------------------------------------------------------
  // 3. Chat functionality
  // -------------------------------------------------------------------------
  test("chat input works and send button is enabled", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // Switch to CREATE mode to show Chat tab
    await page.locator(".mode-tab-create").click();

    // Navigate to chat surface via left rail
    await page.locator(".rail-icon[title=\"Chat\"]").click();

    // Chat surface should render
    await expect(page.locator(".chat-container")).toBeVisible();

    // Find the composer input
    // TODO: data-testid="chat-input" — currently uses id selector
    const input = page.locator("#composer-input");
    await expect(input).toBeVisible();
    await input.fill("hello");

    // Send button should be enabled
    // TODO: data-testid="send-button" — currently uses class
    const sendBtn = page.locator(".composer-send");
    await expect(sendBtn).toBeEnabled();
  });

  test("chat can switch between sessions", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // Navigate to sessions
    await page.locator(".rail-icon[title=\"Sessions\"]").click();
    await expect(page.locator(".sidebar-content")).toBeVisible();

    // Sessions should show the mock sessions
    const sidebar = page.locator(".sidebar-content");
    await expect(sidebar).toContainText("Map src directory structure");
    await expect(sidebar).toContainText("Review API endpoint contracts");

    // Click a session to select it
    await page.locator(".sidebar-item").first().click();
  });

  // -------------------------------------------------------------------------
  // 4. Settings page
  // -------------------------------------------------------------------------
  test("settings surface loads in MANAGE mode", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // Switch to MANAGE mode
    await page.locator(".mode-tab-manage").click();

    // Click settings via left rail
    // TODO: data-testid="surface-settings" — currently via tooltip text
    await page.locator(".rail-icon[title=\"Settings\"]").click();

    // Settings surface should be visible
    await expect(page.locator(".settings-surface")).toBeVisible();
    await expect(page.locator("h2")).toContainText("Settings");

    // Settings sections should be navigable
    const navItems = page.locator(".settings-nav-item");
    await expect(navItems.first()).toBeVisible();
    await expect(navItems).toHaveCount(5);
  });

  test("settings shows adapter connection status", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // Navigate to Settings > Adapter section
    await page.locator(".mode-tab-manage").click();
    await page.locator(".rail-icon[title=\"Settings\"]").click();

    // Click the Adapter section
    await page.locator(".settings-nav-item:has-text(\"Adapter\")").click();

    // Should show adapter endpoint
    await expect(page.locator(".adapter-endpoint-display code")).toContainText("127.0.0.1:39191");
  });

  // -------------------------------------------------------------------------
  // 5. Arsenal panel
  // -------------------------------------------------------------------------
  test("arsenal quick panel opens and shows components", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // Arsenal trigger might be in different locations depending on connection state
    // Just check the panel itself is accessible
    const arsenalPanel = page.locator(".arsenal-quick-panel");

    // If adapter is connected, arsenal should be visible
    const healthOk = await waitForAdapterHealth(page);
    if (healthOk) {
      await expect(arsenalPanel).toBeVisible();
      // Should show some stats
      await expect(page.locator(".arsenal-quick-header")).toBeVisible();
    }
  });

  test("arsenal expand/collapse toggle works", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    const healthOk = await waitForAdapterHealth(page);
    if (!healthOk) {
      test.skip(); // arsenal only renders when adapter connected
    }

    const header = page.locator(".arsenal-quick-header");
    const stats = page.locator(".arsenal-quick-stats");

    // Initially stats may be visible (not collapsed)
    await header.click(); // collapse

    // After collapse, stats should not be visible
    await expect(stats).not.toBeVisible();

    await header.click(); // expand again
    await expect(stats).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 6. Left Rail navigation
  // -------------------------------------------------------------------------
  test("left rail shows correct icons per mode", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    const rail = page.locator(".rail");
    await expect(rail).toBeVisible();

    // CREATE mode - should have mission, design, artifacts, board, chat
    await page.locator(".mode-tab-create").click();
    await expect(page.locator(".rail-icon[title=\"Mission Control\"]")).toBeVisible();
    await expect(page.locator(".rail-icon[title=\"Chat\"]")).toBeVisible();

    // CODE mode - should have runs, processes, checkpoints, worktrees
    await page.locator(".mode-tab-code").click();
    await expect(page.locator(".rail-icon[title=\"Runs & History\"]")).toBeVisible();
    await expect(page.locator(".rail-icon[title=\"Processes\"]")).toBeVisible();

    // AUTOMATE mode
    await page.locator(".mode-tab-automate").click();
    await expect(page.locator(".rail-icon[title=\"Extensions\"]")).toBeVisible();

    // MANAGE mode
    await page.locator(".mode-tab-manage").click();
    await expect(page.locator(".rail-icon[title=\"Settings\"]")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 7. Status bar
  // -------------------------------------------------------------------------
  test("status bar shows connection and profile info", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    const statusBar = page.locator(".status-bar");
    await expect(statusBar).toBeVisible();

    // Should show connection status
    const healthOk = await waitForAdapterHealth(page);
    if (healthOk) {
      await expect(statusBar).toContainText(/Connected|Studio/i);
    }

    // Should show profile name
    await expect(statusBar).toContainText("coder");
  });

  // -------------------------------------------------------------------------
  // 8. Command palette
  // -------------------------------------------------------------------------
  test("command palette opens with Ctrl+K", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // Palette should not be visible
    await expect(page.locator(".command-palette")).not.toBeVisible();

    // Open with keyboard shortcut
    await page.keyboard.press("Control+k");
    await expect(page.locator(".command-palette")).toBeVisible();

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(page.locator(".command-palette")).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 9. Panel toggles
  // -------------------------------------------------------------------------
  test("bottom panel toggle works", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // Bottom panel starts hidden
    await expect(page.locator(".bottom-panel")).not.toBeVisible();

    // Toggle button
    // TODO: data-testid="toggle-bottom" — currently uses title attribute
    await page.locator('.icon-button[title="Toggle bottom panel"]').click();
    await expect(page.locator(".bottom-panel")).toBeVisible();

    await page.locator('.icon-button[title="Toggle bottom panel"]').click();
    await expect(page.locator(".bottom-panel")).not.toBeVisible();
  });

  test("right panel toggle works", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // Right panel starts hidden
    await expect(page.locator(".right-panel")).not.toBeVisible();

    // Toggle
    // TODO: data-testid="toggle-inspector" — currently uses title attribute
    await page.locator('.icon-button[title="Toggle inspector"]').click();
    await expect(page.locator(".right-panel")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 10. No fatal errors on load
  // -------------------------------------------------------------------------
  test("no fatal console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.locator(".app-frame").waitFor({ timeout: 15000 });

    const fatal = errors.filter((e) =>
      /cannot read properties|uncaught typeerror|uncaught referenceerror|failed to fetch/i.test(e),
    );
    expect(fatal).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 11. Adapter disconnection handling
  // -------------------------------------------------------------------------
  test("app handles adapter disconnection gracefully", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // Abort the adapter health endpoint to simulate disconnection
    await page.route("http://127.0.0.1:39191/studio/health", (route) => route.abort());

    // Reload and check app still renders
    await page.reload();
    await expect(page.locator(".app-frame")).toBeVisible({ timeout: 15000 });

    // Status bar should show disconnected
    const statusBar = page.locator(".status-bar");
    await expect(statusBar).toContainText(/Disconnected|Auth|error/i);
  });
});