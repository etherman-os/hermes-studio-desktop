#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "../..");
const artifactDir = path.join(repoRoot, "artifacts", "visual-smoke");
const browserArg = process.argv.find((arg) => arg.startsWith("--browser="));
const browserName = browserArg?.split("=")[1] ?? "chromium";

class VisualSmokeSkip extends Error {}
class VisualSmokeFailure extends Error {}

if (!["chromium", "firefox", "webkit"].includes(browserName)) {
  console.error(`[visual-smoke] Unsupported browser "${browserName}". Use chromium, firefox, or webkit.`);
  process.exit(1);
}

function log(message) {
  console.log(`[visual-smoke] ${message}`);
}

function skip(message) {
  throw new VisualSmokeSkip(message);
}

function fail(message) {
  throw new VisualSmokeFailure(message);
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Could not allocate local port"));
      });
    });
  });
}

async function waitForUrl(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function spawnVite(port) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(
    command,
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: appRoot,
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) console.log(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) console.error(text);
  });
  return child;
}

async function stopServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function launchBrowser(playwrightBrowsers) {
  const browserType = playwrightBrowsers[browserName];
  const envKey = `PLAYWRIGHT_${browserName.toUpperCase()}_EXECUTABLE_PATH`;
  const explicitPath = process.env[envKey] ?? (browserName === "firefox" ? process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH : undefined);

  if (explicitPath) {
    try {
      return await browserType.launch({ headless: true, executablePath: explicitPath, timeout: 15000 });
    } catch (error) {
      fail(`${browserName} launch failed for ${envKey}=${explicitPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    return await browserType.launch({ headless: true, timeout: 15000 });
  } catch (firstError) {
    const systemCandidates = browserName === "firefox" ? ["/usr/bin/firefox", "/snap/bin/firefox"] : [];
    const systemBrowser = systemCandidates.find((candidate) => fs.existsSync(candidate));
    const systemHint = systemBrowser ? ` System ${browserName} was found at ${systemBrowser}; try it explicitly with ${envKey}=${systemBrowser}.` : "";
    skip(`Playwright ${browserName} is not available. ${firstError instanceof Error ? firstError.message : String(firstError)}${systemHint}`);
  }
}

async function run() {
  const providedUrl = process.env.VISUAL_SMOKE_URL;
  const port = providedUrl ? null : await getFreePort();
  const url = providedUrl ?? `http://127.0.0.1:${port}/`;
  let server = null;
  let browser = null;

  let exitCode = 0;

  try {
    if (!providedUrl) {
      log(`Starting Vite dev server at ${url}`);
      server = spawnVite(port);
      await waitForUrl(url);
    } else {
      log(`Using existing frontend URL ${url}`);
      await waitForUrl(url, 5000);
    }

    const playwrightBrowsers = await import("@playwright/test");
    browser = await launchBrowser(playwrightBrowsers);
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator(".app-frame").waitFor({ timeout: 10000 });
    await page.locator(".rail").waitFor();
    await page.locator(".center-area").waitFor();
    await page.locator(".splash-screen").waitFor({ state: "detached", timeout: 5000 });

    for (const label of ["Runs & History", "Chat", "Design Canvas", "Artifacts", "Processes", "Context Inspector", "More tools", "Logs", "Themes", "Settings"]) {
      await page.getByRole("button", { name: label }).first().waitFor({ timeout: 5000 });
    }

    await page.getByRole("button", { name: "More tools" }).click();
    for (const label of ["Board", "Sessions", "Checkpoints", "Hermes Arsenal"]) {
      await page.getByRole("button", { name: label }).first().waitFor({ timeout: 5000 });
    }

    await page.getByRole("tab", { name: "Run Ledger" }).waitFor({ timeout: 5000 });

    if (await page.locator("vite-error-overlay").count()) {
      fail("Vite error overlay is visible.");
    }

    const bodyText = await page.locator("body").innerText();
    const fatalPatterns = [/Uncaught/i, /ReferenceError/i, /TypeError/i, /Cannot read properties/i, /Failed to load module/i, /Internal server error/i];
    const fatal = fatalPatterns.find((pattern) => pattern.test(bodyText));
    if (fatal) {
      fail(`Fatal frontend error text is visible: ${fatal}`);
    }

    fs.mkdirSync(artifactDir, { recursive: true });
    const screenshotPath = path.join(artifactDir, "home.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    log(`Screenshot written to ${path.relative(repoRoot, screenshotPath)}`);
    log(`${browserName} visual smoke passed.`);
  } catch (error) {
    if (error instanceof VisualSmokeSkip) {
      console.warn(`[visual-smoke] SKIP: ${error.message}`);
      console.warn("[visual-smoke] Install Playwright Firefox with: pnpm run test:visual:install");
      console.warn("[visual-smoke] Or set PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH=/usr/bin/firefox if your system Firefox works with Playwright.");
      exitCode = 0;
    } else {
      console.error(`[visual-smoke] FAIL: ${error instanceof Error ? error.message : String(error)}`);
      exitCode = 1;
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) {
      await stopServer(server);
    }
  }

  return exitCode;
}

run().then((exitCode) => {
  process.exitCode = exitCode;
});
