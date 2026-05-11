/**
 * Global teardown: stops the Hermes adapter started by global-setup.ts.
 */
import { execSync } from "child_process";

const ADAPTER_PORT = 39191;

async function isAdapterHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${ADAPTER_PORT}/studio/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function globalTeardown() {
  // If adapter was already running before global-setup, don't touch it
  // We signal this via an env var set by global-setup when WE started it
  if (!process.env.PW_ADAPTER_STARTED) {
    return;
  }

  try {
    const { spawn } = await import("child_process");
    // Try graceful shutdown first via the adapter's graceful stop mechanism
    try {
      await fetch(`http://127.0.0.1:${ADAPTER_PORT}/studio/shutdown`, {
        method: "POST",
        signal: AbortSignal.timeout(2000),
      }).catch(() => {});
    } catch {
      // ignore
    }

    // Then kill any remaining process on the port
    const isWindows = process.platform === "win32";
    const killCmd = isWindows
      ? `netstat -ano | findstr :${ADAPTER_PORT}`
      : `lsof -ti tcp:${ADAPTER_PORT} 2>/dev/null || true`;
    try {
      const pids = execSync(killCmd, { encoding: "utf8" })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid, 10), "SIGTERM");
        } catch {
          try {
            process.kill(parseInt(pid, 10), "SIGKILL");
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // no process found
    }
  } finally {
    delete process.env.PW_ADAPTER_STARTED;
  }
}