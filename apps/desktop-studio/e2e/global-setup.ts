/**
 * Global setup: starts the Hermes adapter before tests run.
 * The adapter must be healthy at 127.0.0.1:39191 before the web server starts.
 */
import { spawn, type ChildProcess } from "child_process";
import { execSync } from "child_process";
import { URL } from "url";

const ADAPTER_PORT = 39191;
const ADAPTER_HOST = "127.0.0.1";
const ADAPTER_URL = `http://${ADAPTER_HOST}:${ADAPTER_PORT}`;
const HEALTH_URL = `${ADAPTER_URL}/studio/health`;
const MAX_WAIT_MS = 60_000;

async function isAdapterHealthy(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForAdapter(timeoutMs = MAX_WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isAdapterHealthy()) return true;
    // sleep 500ms before retry
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function findProjectRoot(): string {
  // argv[1] is the compiled js file path: .../desktop-studio/node_modules/.bin/playwright
  // We want .../apps/desktop-studio
  const cwd = process.cwd();
  return cwd;
}

let adapterProcess: ChildProcess | null = null;
let adapterOutput = "";

export async function globalSetup() {
  const root = findProjectRoot();

  // Check if adapter is already running
  if (await isAdapterHealthy()) {
    console.log("[global-setup] Adapter already healthy at", ADAPTER_URL);
    return;
  }

  console.log("[global-setup] Starting Hermes adapter from:", root);

  // Try to start the adapter using the project's Python environment
  const pythonAdapterCmd = ".venv/bin/python -m hermes_adapter.server";
  const isWindows = process.platform === "win32";
  const shellCmd = isWindows ? "cmd" : "bash";
  const shellArgs = isWindows ? ["/c", pythonAdapterCmd] : ["-c", pythonAdapterCmd];

  adapterProcess = spawn(shellCmd, shellArgs, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    detached: !isWindows,
  });

  if (adapterProcess.stdout) {
    adapterProcess.stdout.on("data", (chunk: Buffer) => {
      adapterOutput += chunk.toString();
    });
  }
  if (adapterProcess.stderr) {
    adapterProcess.stderr.on("data", (chunk: Buffer) => {
      adapterOutput += chunk.toString();
    });
  }

  console.log("[global-setup] Waiting for adapter to become healthy...");
  const ready = await waitForAdapter(MAX_WAIT_MS);

  if (!ready) {
    console.error("[global-setup] Adapter failed to start. Output:");
    console.error(adapterOutput.slice(-2000)); // last 2KB of output
    throw new Error(
      `Hermes adapter did not become healthy at ${ADAPTER_URL} within ${MAX_WAIT_MS}ms`,
    );
  }

  console.log("[global-setup] Adapter is healthy. Proceeding to test run.");
}

export async function globalTeardown() {
  if (adapterProcess) {
    console.log("[global-teardown] Stopping adapter process...");
    try {
      if (!adapterProcess.killed) {
        process.kill(adapterProcess.pid!, "SIGTERM");
      }
    } catch {
      // ignore
    }
    adapterProcess = null;
  } else {
    console.log("[global-teardown] No adapter process to stop (was already running).");
  }
}