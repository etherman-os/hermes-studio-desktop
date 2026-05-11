/**
 * Playwright config for e2e smoke tests.
 * Runs against the live dev server at http://localhost:1420.
 * Requires the Hermes adapter at 127.0.0.1:39191.
 */
import { defineConfig, devices } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 1420;

export default defineConfig({
  testDir: __dirname,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start vite dev server (which itself starts the adapter via Tauri/Rust)
  webServer: {
    command: "pnpm dev",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_HERMES_STUDIO_ADAPTER_TOKEN: "test-token-playwright",
    },
  },
  globalSetup: "global-setup.ts",
  globalTeardown: "global-teardown.ts",
});