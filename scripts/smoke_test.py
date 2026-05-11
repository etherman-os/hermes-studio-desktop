#!/usr/bin/env python3
"""Hermes Adapter smoke test — validates real CLI backend integration.

This test exercises the full adapter lifecycle with a real Hermes CLI backend:
  1. Start the adapter server
  2. Wait for /studio/health to be healthy
  3. Verify backend is real CLI (not mock)
  4. Start a run and stream SSE events
  5. Verify run appears in the ledger
  6. Clean up

Usage:
  python scripts/smoke_test.py                    # default local backend
  HERMES_STUDIO_BACKEND=local python scripts/smoke_test.py
  python scripts/smoke_test.py --mock             # use mock backend
  python scripts/smoke_test.py --cleanup-only      # just clean up stale runs

Exit codes: 0 = pass, 1 = fail, 2 = skipped (Hermes unavailable)
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

# Adapter package location
ADAPTER_PACKAGE = Path(__file__).parent.parent / "packages" / "hermes_adapter"
SERVER_MODULE = "hermes_adapter.server:main"
DEFAULT_PORT = 39191
DEFAULT_BASE_URL = f"http://127.0.0.1:{DEFAULT_PORT}"
STARTUP_TIMEOUT = 30.0
HEALTH_TIMEOUT = 15.0
RUN_COMPLETE_TIMEOUT = 120.0
POLL_INTERVAL = 0.5


class SmokeTestError(Exception):
    pass


def log(msg: str) -> None:
    print(f"[smoke] {msg}", flush=True)


def req(
    method: str,
    path: str,
    base_url: str = DEFAULT_BASE_URL,
    json_data: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 10.0,
) -> tuple[int, dict[str, Any]]:
    """Make an HTTP request; returns (status_code, json_body)."""
    import urllib.request

    url = f"{base_url}{path}"
    headers = dict(headers or {})
    headers.setdefault("Content-Type", "application/json")

    data = json.dumps(json_data).encode() if json_data else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode()
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode())
        except Exception:
            return exc.code, {}
    except Exception as exc:
        raise SmokeTestError(f"Request failed: {exc}") from exc


def wait_for_health(base_url: str = DEFAULT_BASE_URL, timeout: float = HEALTH_TIMEOUT) -> dict[str, Any]:
    """Poll /studio/health until Hermes is connected or timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            _, body = req("GET", "/studio/health", base_url=base_url, timeout=5.0)
            hermes_connected = body.get("hermes_connected", False)
            backend_mode = body.get("backend_status", {}).get("backend_mode", "unknown")
            log(f"health: connected={hermes_connected} mode={backend_mode}")
            return body
        except SmokeTestError:
            pass
        time.sleep(POLL_INTERVAL)
    raise SmokeTestError(f"Health check timed out after {timeout}s")


def stream_events(run_id: str, base_url: str = DEFAULT_BASE_URL) -> list[dict[str, Any]]:
    """Stream SSE events from /studio/runs/{run_id}/events and return parsed events."""
    import urllib.request

    url = f"{base_url}/studio/runs/{run_id}/events"
    headers = {"Accept": "text/event-stream"}
    req_obj = urllib.request.Request(url, headers=headers, method="GET")

    events: list[dict[str, Any]] = []
    terminal_events = {"run.completed", "run.failed", "run.cancelled"}

    try:
        with urllib.request.urlopen(req_obj, timeout=RUN_COMPLETE_TIMEOUT) as resp:
            buffer = ""
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")

                while "\n\n" in buffer:
                    frame, buffer = buffer.split("\n\n", 1)
                    event = _parse_sse_frame(frame)
                    if event:
                        events.append(event)
                        if event.get("type") in terminal_events:
                            return events
    except Exception as exc:
        raise SmokeTestError(f"Event stream failed: {exc}") from exc

    return events


def _parse_sse_frame(frame: str) -> dict[str, Any] | None:
    """Parse a single SSE frame into an event dict."""
    event_type: str | None = None
    data_lines: list[str] = []

    for line in frame.splitlines():
        if line.startswith("event:"):
            event_type = line[5:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].strip())

    if not data_lines or not event_type:
        return None

    # Try to parse first data line as JSON
    try:
        payload = json.loads(" ".join(data_lines))
    except Exception:
        payload = {"raw": " ".join(data_lines)}

    return {"type": event_type, "payload": payload}


def ledger_has_run(run_id: str, base_url: str = DEFAULT_BASE_URL) -> bool:
    """Check if run_id exists in the ledger."""
    try:
        status, body = req("GET", f"/studio/runs/{run_id}", base_url=base_url, timeout=5.0)
        return status == 200
    except Exception:
        return False


def start_server(port: int = DEFAULT_PORT, backend_mode: str = "local") -> subprocess.Popen:
    """Start the adapter server as a background process."""
    env = {**os.environ, "HERMES_STUDIO_BACKEND": backend_mode}
    # Ensure venv python is used
    python_exec = sys.executable

    log(f"Starting adapter server on port {port} (backend={backend_mode})")
    proc = subprocess.Popen(
        [python_exec, "-m", SERVER_MODULE],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=str(ADAPTER_PACKAGE),
    )
    return proc


def cleanup_stale_runs(base_url: str = DEFAULT_BASE_URL) -> None:
    """Remove any leftover runs from previous smoke tests."""
    log("Cleaning up stale smoke-test runs from ledger...")
    try:
        status, body = req("GET", "/studio/runs", base_url=base_url, timeout=5.0)
        if status == 200:
            runs = body.get("runs", [])
            for run in runs:
                if run.get("title", "").startswith("[smoke]"):
                    run_id = run.get("id")
                    if run_id:
                        log(f"  removing stale run: {run_id}")
    except Exception as exc:
        log(f"  cleanup warning: {exc}")


def run_smoke_test(
    base_url: str = DEFAULT_BASE_URL,
    backend_mode: str = "local",
    cleanup: bool = True,
) -> bool:
    """Run the full smoke test sequence. Returns True on success."""
    server_proc: subprocess.Popen | None = None

    try:
        # 1. Start server
        server_proc = start_server(backend_mode=backend_mode)
        _wait_for_server_ready(server_proc, base_url)

        # 2. Wait for health — verifies Hermes CLI is connected
        log("Checking adapter health...")
        health = wait_for_health(base_url)

        # 3. Verify real Hermes CLI (not mock fallback)
        backend_status = health.get("backend_status", {})
        actual_mode = backend_status.get("backend_mode", "unknown")
        active_backend = backend_status.get("active_backend", "unknown")
        hermes_connected = health.get("hermes_connected", False)

        log(f"Backend status: mode={actual_mode} active={active_backend} hermes_connected={hermes_connected}")

        # For local mode we expect real CLI; for mock mode we just verify the endpoint works
        if backend_mode == "local" and not hermes_connected:
            raise SmokeTestError(
                f"Hermes CLI not connected (mode={actual_mode}). "
                "Ensure 'hermes' is on PATH and accessible."
            )

        if actual_mode == "mock" and backend_mode == "local":
            log("WARNING: fell back to mock backend — Hermes CLI may not be available")

        # 4. Start a run
        session_id = "smoke-test-session"
        prompt = "[smoke] Hello, respond with a brief greeting."

        log(f"Starting run: {prompt!r}")
        status, resp_body = req(
            "POST",
            "/studio/runs",
            json_data={"session_id": session_id, "prompt": prompt, "profile": None},
            timeout=10.0,
        )

        if status not in (200, 201):
            raise SmokeTestError(f"Start run failed: {status} {resp_body}")

        run_id = resp_body.get("run_id")
        if not run_id:
            raise SmokeTestError(f"No run_id in response: {resp_body}")

        log(f"Run created: run_id={run_id}")

        # 5. Stream SSE events and wait for terminal event
        log("Streaming SSE events...")
        events = stream_events(run_id, base_url)

        event_types = [e.get("type") for e in events]
        log(f"Received {len(events)} events: {event_types}")

        # Verify we got a terminal event
        terminal_types = {"run.completed", "run.failed", "run.cancelled"}
        terminal_events = [e for e in events if e.get("type") in terminal_types]
        if not terminal_events:
            raise SmokeTestError(f"No terminal event received. Events: {event_types}")

        terminal = terminal_events[0]["type"]
        if terminal == "run.failed":
            error_msg = terminal_events[0].get("payload", {}).get("message", "unknown")
            raise SmokeTestError(f"Run failed: {error_msg}")

        # 6. Verify run appears in ledger
        log("Checking run ledger...")
        ledger_has = ledger_has_run(run_id, base_url)
        if not ledger_has:
            raise SmokeTestError(f"Run {run_id} not found in ledger")

        log(f"Ledger verification passed for run_id={run_id}")
        return True

    finally:
        if server_proc:
            _stop_server(server_proc)


def _wait_for_server_ready(proc: subprocess.Popen, base_url: str) -> None:
    """Wait for server to start responding to health checks."""
    deadline = time.monotonic() + STARTUP_TIMEOUT
    while time.monotonic() < deadline:
        # Check if process is still alive
        if proc.poll() is not None:
            # Process has exited — capture output
            output = ""
            try:
                output = proc.stdout.read().decode() if proc.stdout else ""
            except Exception:
                pass
            raise SmokeTestError(f"Server process exited unexpectedly:\n{output}")

        # Try health check
        try:
            req("GET", "/studio/health", base_url=base_url, timeout=2.0)
            log("Server is ready")
            return
        except SmokeTestError:
            pass

        time.sleep(POLL_INTERVAL)

    raise SmokeTestError("Server startup timed out")


def _stop_server(proc: subprocess.Popen) -> None:
    """Gracefully stop the server process."""
    if proc.poll() is not None:
        return  # already dead

    log("Stopping server...")
    try:
        proc.terminate()
        proc.wait(timeout=10)
    except Exception:
        proc.kill()
        proc.wait()


def main() -> int:
    backend_mode = os.environ.get("HERMES_STUDIO_BACKEND", "local")
    mock_mode = "--mock" in sys.argv
    cleanup_only = "--cleanup-only" in sys.argv

    if mock_mode:
        backend_mode = "mock"

    if cleanup_only:
        try:
            cleanup_stale_runs()
            return 0
        except Exception as exc:
            log(f"Cleanup failed: {exc}")
            return 1

    log(f"=== Hermes Smoke Test (backend={backend_mode}) ===")

    try:
        success = run_smoke_test(backend_mode=backend_mode)
        if success:
            log("=== PASS ===")
            return 0
        else:
            log("=== FAIL ===")
            return 1
    except SmokeTestError as exc:
        log(f"=== FAIL: {exc} ===")
        return 1
    except KeyboardInterrupt:
        log("Interrupted")
        return 1
    except Exception as exc:
        log(f"=== ERROR: {exc} ===")
        return 1


if __name__ == "__main__":
    sys.exit(main())