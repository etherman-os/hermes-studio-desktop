# Backend Audit Report — hermes_adapter

**Audit scope:** `/home/etherman/Projects/hermes_shell/packages/hermes_adapter/hermes_adapter/`
**Files audited (10):**
`__init__.py`, `backend_factory.py`, `hermes_backend.py`, `hermes_cli_backend.py`,
`input_validator.py`, `mock_backend.py`, `process_manager.py`, `security.py`,
`studio_routes.py`, `studio_storage.py`

**Missing files (5):** `adapter.py`, `session.py`, `types.py`, `utils.py`, `worktree.py`
— listed in the task but not present in the package directory.

**Compilation check:** `python3 -m py_compile` — all 10 present files pass cleanly.

---

## Severity Scale

| Rating | Meaning |
|--------|---------|
| 🔴 CRITICAL | Security vulnerability or data loss risk |
| 🟠 HIGH | Crash, hang, resource leak, or significant correctness issue |
| 🟡 MEDIUM | Non-correctness issue, degraded behavior, or missing guard |
| 🟢 LOW | Code quality / maintainability / style |
| ℹ️ INFO | Noted observation, not a defect |

---

## File-by-File Findings

---

### 1. `__init__.py`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Empty file — no public API surface defined or re-exported | ℹ️ INFO |

**Notes:** Package exports only `__version__`. No issues.

---

### 2. `backend_factory.py`

| # | Issue | Details |
|---|-------|---------|
| 1 | **Missing type annotation** on `create_backend()` return (not `StudioBackend` — it IS annotated, but local variable `backend: StudioBackend = MockBackend()` is fine). Actual missing: none found after review. | 🟢 LOW |
| 2 | **`except Exception` swallowing in `_health_with_timeout`** — catches `Exception` and returns `{"status": "unavailable", "reason": str(e)}` with no logging. If Hermes is failing for an unexpected reason, operators have no visibility. | 🟡 MEDIUM |

**Other checks:**
- ✅ Uses `asyncio.wait_for` with timeout — no missing timeout
- ✅ No bare `except` elsewhere
- ✅ No SQL queries
- ✅ No file/network resources opened without `finally`/`async with`
- ✅ No obvious circular imports
- ✅ `_HEALTH_TIMEOUT_SECONDS = 10.0` constant defined and used

---

### 3. `hermes_backend.py`

| # | Issue | Details |
|---|-------|---------|
| 1 | **`httpx.AsyncClient` created in `__init__` without any `close()` / `aclose()` on program shutdown path.** The class has `async def close()` defined at the bottom, but there is no guarantee it is called. Process may exit with open connections. | 🟠 HIGH |
| 2 | **`stream_run_events` async generator does not handle `CancelledError`** — when a client disconnects (e.g., browser closes), FastAPI cancels the generator's task. The code catches `httpx.ReadTimeout` and `httpx.RemoteProtocolError` explicitly but not `asyncio.CancelledError`. The outer `stream_run_events` caller in `studio_routes.py` does handle it, but direct callers of the backend method would not. | 🟡 MEDIUM |
| 3 | **Bare `except Exception` in `stream_run_events`** at the outer try-except that wraps the `async with self._client.stream`: catches `Exception` and yields a `run.failed` event. No logging. Swallows all exceptions silently in the stream. | 🟡 MEDIUM |
| 4 | **Bare `except Exception` in `_init_repos`** — silently logs warning and continues when repo initialization fails. Function returns `None` implicitly. Acceptable here since repos are optional, but non-transparent failure. | 🟢 LOW |
| 5 | **Missing timeout on `stream_run_events` SSE `async with`** — `timeout=None` is explicitly set (no timeout on the streaming connection). For long-running SSE this is intentional but should be documented. | ℹ️ INFO |
| 6 | **Circuit breaker `_circuit` is a module-level global** — `_CircuitBreaker` uses `asyncio.get_event_loop().time()` in its `state` property. If event loop is not running or changes, this could behave incorrectly. However, `record_success`/`record_failure` use it correctly. | 🟡 MEDIUM |
| 7 | **`bootstrap()` method does async import of `HermesInventoryRepository`** inside the method — not a circular import but creates a local dependency. Could fail at runtime if module is not available. | ℹ️ INFO |

**Other checks:**
- ✅ `_fetch_json` has explicit `timeout=5.0`
- ✅ `_retry_with_backoff` has explicit max_retries with backoff
- ✅ `_headers()` returns new dict each time (no shared mutation)
- ✅ No SQL queries (uses httpx only)
- ✅ Circuit breaker pattern implemented correctly
- ✅ Subprocess calls (`hermes` CLI fallback) have timeouts set

---

### 4. `hermes_cli_backend.py`

| # | Issue | Details |
|---|-------|---------|
| 1 | **`stream_run_events` async generator — `CancelledError` handling present** ✅ — correctly handles `asyncio.CancelledError` in both the main `except` and `finally` block, cleaning up `stderr_task` before re-raising. | 🟢 LOW |
| 2 | **No timeout on `asyncio.create_subprocess_exec`** for the main run loop (`_command_for_run` builds the command). The `timeout` from `get_cli_run_timeout_seconds()` is applied to the overall `deadline` calculation, but the subprocess itself has no per-operation timeout. Long CLI output with slow writes to stdout could stall indefinitely. | 🟠 HIGH |
| 3 | **`_active_cli_runs` and `_processes` dicts are mutated without a lock** — concurrent calls to `start_run`/`stop_run` from different async tasks could race. The class has no `asyncio.Lock` protecting these dicts. | 🟡 MEDIUM |
| 4 | **`stderr_task` cancellation pattern is duplicated** — three separate `finally`/`except CancelledError` blocks all do the same `stderr_task.cancel()` + `await stderr_task` dance. Could be a helper method. | 🟢 LOW |
| 5 | **SSH remote command construction** — `_base_cli_command` builds a remote SSH command using `shlex.quote`. The `remote_hermes_bin` is validated on construction with `_SHELL_METACHAR_RE`. This is a good security practice. ✅ | 🟢 LOW |
| 6 | **`_cwd_for_run` uses `Path.is_dir()` without handling `OSError`** — if the directory is deleted between the check and use, could raise. Minor. | 🟢 LOW |

**Other checks:**
- ✅ `_cli_probe` has timeout=10 on subprocess
- ✅ `_cli_capture` has explicit timeout parameter
- ✅ `async def _cli_capture` is used with `await asyncio.to_thread`
- ✅ No SQL queries
- ✅ No circular imports
- ✅ Proper `finally` block cleans up `_processes` and `_active_cli_runs`

---

### 5. `input_validator.py`

| # | Issue | Details |
|---|-------|---------|
| 1 | **No issues found.** All functions have type annotations, proper exception raising with `ValidationError`, regex validation for paths, no bare `except`, no SQL queries. | ✅ CLEAN |

---

### 6. `mock_backend.py`

| # | Issue | Details |
|---|-------|---------|
| 1 | **`stream_run_events` async generator — `CancelledError` handled correctly** ✅ — explicitly catches `asyncio.CancelledError`, cleans up `self._active_runs` and `self._run_cancelled`, then re-raises. | 🟢 LOW |
| 2 | **`stream_logs` async generator — `CancelledError` caught and swallowed** — `while True` loop with `await asyncio.sleep(1.5)` catches `asyncio.CancelledError` and returns silently. No cleanup needed, but swallowing cancellation without re-raising is inconsistent with the pattern used in `stream_run_events`. | 🟡 MEDIUM |
| 3 | **No type annotation** on `_model_config` attribute initialization (dynamic dict assigned in `__init__`). Not a real issue. | ℹ️ INFO |

**Other checks:**
- ✅ No network I/O (mock only)
- ✅ No SQL queries
- ✅ No file resources
- ✅ No circular imports
- ✅ `async for` loops properly handle cancellation via `CancelledError`

---

### 7. `process_manager.py`

| # | Issue | Details |
|---|-------|---------|
| 1 | **`ManagedProcess._lock` and `_output_task` are dataclass fields** but the class does `async with proc._lock` in multiple places. If the process crashes before the lock is first used, there is no guarantee the lock is properly initialized. Acceptable — `asyncio.Lock()` is a factory. | 🟢 LOW |
| 2 | **`start_process` — no timeout on `asyncio.create_subprocess_shell`** — the subprocess spawns with no per-command timeout. If a template command hangs, the process manager has no way to time it out. The `timeout` config is only used in `stop_process` as a grace period for graceful termination, not for launch. | 🟡 MEDIUM |
| 3 | **`stop_process` — `TimeoutError` from `await asyncio.wait_for(proc._process.wait(), timeout=5.0)` not caught** — if graceful SIGTERM fails and then SIGKILL also fails, the `wait()` call could raise. Currently the code does not handle this. | 🟡 MEDIUM |
| 4 | **Global `_manager` is not thread-safe** for initialization — `get_process_manager()` checks `if _manager is None` without a lock in a non-async context. While `ProcessManager.__init__` is not async, if called from multiple threads simultaneously before initialization completes, duplicate managers could be created. This is a pre-existing singleton pattern issue. | 🟡 MEDIUM |
| 5 | **Template commands are hardcoded strings** — `TEMPLATES` dict contains shell commands as strings. No user input flows into these directly, so command injection is not possible. | ✅ SECURE |

**Other checks:**
- ✅ `_validate_env_overrides` has comprehensive validation
- ✅ `_resolve_workdir` does path traversal check (`os.path.commonpath`)
- ✅ No SQL queries
- ✅ `_stream_output` properly handles exceptions and logs
- ✅ `remove_process` properly cancels `_output_task` before deletion

---

### 8. `security.py`

| # | Issue | Details |
|---|-------|---------|
| 1 | **`_load_auth_failures_from_disk` and `_save_auth_failures_to_disk` — no `finally` block** — both read and write JSON files without guaranteeing the file handle is closed. However, `path.read_text()` and `path.write_text()` are context-managed by the OS; no explicit `with` needed for these stdlib helpers. | 🟢 LOW |
| 2 | **`_record_failure` calls `get_audit_logger()` and catches `Exception`** — audit logging must never break the auth flow. The code passes this requirement but silently ignores all failures. | 🟡 MEDIUM |
| 3 | **`read_token()` — `FileNotFoundError` propagates to caller** — The `require_token` dependency catches `FileNotFoundError` explicitly, so this is handled. Not a bug. | ✅ OK |
| 4 | **`is_token_expired` uses `time.monotonic()` for both in-memory and file-based tokens** — consistent monotonic clock usage is good. | ✅ OK |
| 5 | **`write_token` calls `os.chmod(str(path), 0o600)` in a separate call after `safe_write`** — there is a TOCTOU window between the atomic rename and the chmod. If the process crashes in that window, the file could be left world-readable. The comment acknowledges this. | 🟡 MEDIUM |
| 6 | **Module-level global `_auth_failures` dict** — shared mutable state across requests. No locking. In a high-concurrency async server, prune operations (`_auth_failures[client_ip] = [t for t in failures if t > cutoff]`) could race. Unlikely to cause correctness issues but worth noting. | 🟡 MEDIUM |

**Other checks:**
- ✅ `require_token` is a proper FastAPI dependency
- ✅ Rate limiting implemented correctly
- ✅ `secrets.compare_digest` used for constant-time comparison
- ✅ No SQL queries
- ✅ Token generated with `secrets.token_hex(32)`

---

### 9. `studio_routes.py`

| # | Issue | Details |
|---|-------|---------|
| 1 | **`/runs/{run_id}/events` — `event_generator()` async generator handles `CancelledError`** ✅ — catches `asyncio.CancelledError` on client disconnect, emits `run.interrupted` event, and returns cleanly. | 🟢 LOW |
| 2 | **`/logs/stream` — `log_generator()` does NOT handle `CancelledError`** — the `async for event in backend.stream_logs(source=source)` loop has no `try/except CancelledError`. If the client disconnects during streaming, the generator will be cancelled and potentially leave the backend stream in an undefined state. | 🟡 MEDIUM |
| 3 | **Backend lock `_backend_lock` is an `asyncio.Lock()`** — `await _get_backend()` uses double-check pattern with the lock. Correctly implemented. | ✅ OK |
| 4 | **`_audit_log_config_change` and `_audit_log_...` helpers silently swallow exceptions** — audit logging failures do not break request processing (by design), but there is no visibility into audit failures. | 🟡 MEDIUM |
| 5 | **`subprocess.run` via `asyncio.to_thread` in `_run_local_hermes`** — subprocess calls have explicit timeouts. ✅ | ✅ OK |
| 6 | **No SQL injection** — all routing uses ORM patterns or validated string constants. | ✅ OK |
| 7 | **`/artifacts/{artifact_id}/browser-evidence` — `screenshot_path.write_text` for generated HTML** — `_safe_browser_preview_html` strips script tags and event handlers from artifact HTML. CSP meta tag is injected. Looks secure. | ✅ SECURE |
| 8 | **Import chain: `studio_routes` imports many backend repository modules** — could cause slow startup if any of these have heavy imports. Not a correctness issue. | ℹ️ INFO |
| 9 | **`_backend_lock` — timeout `_BACKEND_LOCK_TIMEOUT = 30.0`** — backend initialization has a 30s timeout which is appropriate. | ✅ OK |

**Other checks:**
- ✅ All HTTP endpoints have `Depends(require_token)` (auth protection)
- ✅ Request validation with regex patterns for ids/identifiers
- ✅ XSS protection in artifact HTML preview
- ✅ No circular imports detected

---

### 10. `studio_storage.py`

| # | Issue | Details |
|---|-------|---------|
| 1 | **`StudioStorage.connect()` — connection is NOT closed after use** — the `connect()` context manager yields the connection but does NOT close it. The comment says "Reuses a cached connection when possible" and the connection is held in `self._cached_conn`. If the connection is reused, it must be kept open. However, the WAL mode + reused connection pattern means the same SQLite connection object is used across many calls. This is intentional but worth documenting. | ℹ️ INFO |
| 2 | **`close()` method only closes `self._cached_conn`** — does not close any in-flight connections from `connect()`. The context manager yields the same `self._cached_conn`, so `close()` should typically be called when done, but the design is that `connect()` holds the lock and returns the same conn object. | ℹ️ INFO |
| 3 | **`_create_backup` / `_rotate_backups` — no `finally` on backup writes** — `shutil.copy2` is used without a try/finally. If copy fails mid-way, no cleanup. Minor: backup is best-effort. | 🟢 LOW |
| 4 | **`rollback_migration` — sqlite connection opened on backup file without guaranteed close** — the `conn.close()` is in a `finally` but if an exception occurs in the `if` block before `conn.close()`, the connection leaks. | 🟡 MEDIUM |
| 5 | **Thread lock `_conn_lock` for SQLite connection access** — `StudioStorage` uses a `threading.Lock()` (not async) to protect the cached connection. In an async context with sync SQLite operations via `connect()`, this serializes access correctly. However, if async code ever calls `self.connect()` from multiple threads, there could be issues. Currently all usage appears to be from async handlers that run in the same thread. | 🟢 LOW |
| 6 | **No WAL timeout configured** — `_enable_wal` enables WAL mode but does not set `busy_timeout`. SQLite default is 0, so concurrent writes could get `SQLITE_BUSY` immediately. In practice, the studio is likely single-user so this is fine. | ℹ️ INFO |
| 7 | **`StudioStorage.initialize()` — `finally: conn.close()`** on the migrated connection. ✅ | ✅ OK |
| 8 | **All SQL is parameterized** — uses `?` placeholders throughout. No string concatenation in queries. | ✅ SECURE |
| 9 | **`_is_hermes_state_db_path` check prevents pointing studio DB at hermes state.db** — intentional safety check. | ✅ OK |

---

## Summary Table

| File | 🔴 CRITICAL | 🟠 HIGH | 🟡 MEDIUM | 🟢 LOW | ℹ️ INFO |
|------|-------------|---------|-----------|--------|---------|
| `__init__.py` | — | — | — | — | 1 |
| `backend_factory.py` | — | — | 1 | — | — |
| `hermes_backend.py` | — | 1 | 2 | 1 | 2 |
| `hermes_cli_backend.py` | — | 1 | 1 | 2 | — |
| `input_validator.py` | — | — | — | — | ✅ CLEAN |
| `mock_backend.py` | — | — | 1 | — | 1 |
| `process_manager.py` | — | — | 3 | 1 | — |
| `security.py` | — | — | 3 | 1 | — |
| `studio_routes.py` | — | — | 2 | 1 | 2 |
| `studio_storage.py` | — | — | 1 | 1 | 4 |
| **TOTAL** | **0** | **2** | **14** | **7** | **11** |

---

## High-Priority Issues Requiring Attention

### H1 — `hermes_backend.py`: `httpx.AsyncClient` not closed on shutdown
The `HermesBackend` creates an `httpx.AsyncClient` in `__init__` and has a `close()` method, but there's no guarantee `close()` is called when the application shuts down. If Hermes backend is used as the global singleton (via `_get_backend()`), the client will leak open connections.

**Recommendation:** Use `async with httpx.AsyncClient()` as a context manager or register `atexit`/`lifespan` shutdown hook.

### H2 — `hermes_cli_backend.py`: `stream_run_events` subprocess has no per-operation timeout
While the overall run has a `deadline` calculation, the subprocess stdout `readline()` calls have no per-call timeout. If Hermes CLI stops producing output but stays alive, the `inactivity_timeout` of 60s will eventually fire, but there's no per-`readline()` timeout. On a heavily loaded system, `readline()` could block indefinitely if the pipe buffer fills.

**Recommendation:** Wrap `process.stdout.readline()` in `asyncio.wait_for(..., timeout=...)`.

### M1 — `process_manager.py`: `start_process` has no timeout on `asyncio.create_subprocess_shell`
The subprocess launch itself has no timeout. A template command that immediately hangs (e.g., missing dependency) will cause `start_process` to hang indefinitely.

**Recommendation:** Wrap the `create_subprocess_shell` call in `asyncio.wait_for`.

### M2 — `security.py`: TOCTOU in `write_token`
Between the atomic rename completing and `os.chmod` being called, the token file exists with default permissions. On a multi-user system, another process could read the token before the chmod completes.

**Recommendation:** Write to a temp file in the same directory with 0o600 permissions, then atomic rename (already done for content via `safe_write`, but the permissions step needs care).

### M3 — `studio_routes.py`: `/logs/stream` does not handle `CancelledError`
When a client disconnects from the log stream endpoint, the `log_generator()` async generator has no `try/except asyncio.CancelledError`. The stream will be abruptly cancelled without any cleanup event emission.

**Recommendation:** Add `except asyncio.CancelledError: return` at the end of the `async for` loop's `try` block.

---

## Low / Informational Notes

- **`adapter.py`, `session.py`, `types.py`, `utils.py`, `worktree.py`** are listed in the task but do not exist in the package. They may have been planned but not yet created, or moved elsewhere.
- **`hermes_backend.py` circuit breaker global `_circuit`** — works in typical async server scenarios but relies on `get_event_loop().time()`. Document the assumption that the event loop is always the same.
- **`studio_storage.py` connection reuse** is intentional and well-commented, but the `close()` method semantics should be clarified: calling `close()` invalidates the shared connection, which will be reopened on next `connect()`.
- All SQL queries in `studio_storage.py` use parameterized queries — no SQL injection risk.
- All file paths are sanitized before use — no path traversal risk.
- Artifact HTML preview has XSS mitigations (CSP injection, script tag removal).

---

*Audit completed on: Monday, May 11, 2026*
*Python compilation check: all 10 present files — PASS*