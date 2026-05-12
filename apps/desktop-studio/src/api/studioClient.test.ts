import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

async function loadClient() {
  vi.resetModules();
  return import("./studioClient");
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("studioClient auth bootstrap", () => {
  it("uses an explicit dev env token for protected requests", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ adapter_version: "0.1.0" }));
    const localStorageMock = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", localStorageMock);

    const api = await loadClient();
    const auth = await api.initializeAdapterAuth();
    await api.getBootstrap();

    expect(auth).toEqual({ authenticated: true, source: "env" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:39191/studio/bootstrap",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer dev-token" }),
      }),
    );
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(localStorageMock.getItem).not.toHaveBeenCalled();
  });

  it("uses the Tauri token bridge when browser dev env is absent", async () => {
    const tauri = await import("@tauri-apps/api/core");
    vi.mocked(tauri.invoke).mockResolvedValue("tauri-token");
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

    const api = await loadClient();
    const auth = await api.initializeAdapterAuth();

    expect(auth).toEqual({ authenticated: true, source: "tauri" });
    expect(tauri.invoke).toHaveBeenCalledWith("get_adapter_auth_token");
  });

  it("does not call protected endpoints without a token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();

    await expect(api.getBootstrap()).rejects.toThrow("Adapter auth token is unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("studioClient protocol surface", () => {
  it("uses /studio/health without falling back to root /health", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "healthy",
        adapter_version: "0.1.0",
        hermes_connected: false,
        backend_mode: "mock",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");

    const api = await loadClient();
    await api.initializeAdapterAuth();
    await api.checkAdapterHealthDetailed();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/health");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer dev-token" }),
    });
  });

  it("parses the standard error envelope", async () => {
    const api = await loadClient();
    const message = api.adapterErrorMessage(
      {
        error: {
          code: "auth_missing",
          message: "Missing Authorization header",
          retryable: false,
          source: "adapter",
        },
      },
      401,
    );

    expect(message).toBe("Missing Authorization header");
  });

  it("uses /studio/kanban/* for Kanban protocol calls", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "card_1",
        board_id: "board_default",
        column_id: "col_default_inbox",
        title: "Card",
        description: "",
        priority: "normal",
        status: "inbox",
        position: 0,
        session_id: null,
        run_id: null,
        created_at: "2026-05-07T00:00:00Z",
        updated_at: "2026-05-07T00:00:00Z",
        archived_at: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    await api.createKanbanCard({ title: "Card" });
    await api.linkKanbanCardToSession("card_1", "session_1");
    await api.linkKanbanCardToRun("card_1", "run_1");

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/kanban/cards");
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer dev-token" }),
      }),
    );
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:39191/studio/kanban/cards/card_1/link-session");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ session_id: "session_1" });
    expect(fetchMock.mock.calls[2][0]).toBe("http://127.0.0.1:39191/studio/kanban/cards/card_1/link-run");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({ run_id: "run_1" });
  });

  it("uses /studio/runs/* for persisted run ledger calls", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ runs: [], total: 0, history_available: true }))
      .mockResolvedValueOnce(jsonResponse({
        run: {
          id: "run-1",
          session_id: null,
          status: "completed",
          title: "Run",
          prompt_preview: "Run",
          started_at: "2026-05-07T00:00:00Z",
          completed_at: null,
          duration_ms: null,
          backend: "mock",
          model: null,
          error: null,
          workspace_path: null,
        },
        events: [],
        history_available: true,
      }))
      .mockResolvedValueOnce(jsonResponse({
        left: { run_id: "run-1", status: "completed", backend: "mock", model: null, workspace_path: null, duration_ms: null, event_count: 1, event_type_counts: { "run.completed": 1 }, tool_names: [], warning_count: 0, error_count: 0, approval_count: 0, assistant_chars: 0 },
        right: { run_id: "run-2", status: "failed", backend: "mock", model: null, workspace_path: null, duration_ms: null, event_count: 2, event_type_counts: { "run.failed": 1, "tool.completed": 1 }, tool_names: ["pytest"], warning_count: 0, error_count: 1, approval_count: 0, assistant_chars: 0 },
        delta: { status_changed: true, model_changed: false, backend_changed: false, duration_delta_ms: null, event_count_delta: 1, warning_delta: 0, error_delta: 1, assistant_char_delta: 0, added_tools: ["pytest"], removed_tools: [], event_type_delta: { "run.completed": -1, "run.failed": 1, "tool.completed": 1 } },
        history_available: true,
      }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    await api.getRecentRuns();
    await api.getRunLedger("run-1");
    await api.compareRuns("run-1", "run-2");

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/runs/recent?limit=50");
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:39191/studio/runs/run-1/ledger");
    expect(fetchMock.mock.calls[2][0]).toBe("http://127.0.0.1:39191/studio/runs/compare?left_run_id=run-1&right_run_id=run-2");
  });

  it("uses /studio/artifacts/* for artifact protocol calls", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const artifact = {
      id: "artifact_1",
      title: "Run report",
      type: "markdown",
      description: null,
      file_path: null,
      file_name: null,
      mime_type: null,
      size_bytes: null,
      run_id: "run-1",
      session_id: null,
      kanban_card_id: null,
      source: "run",
      created_at: "2026-05-07T00:00:00Z",
      updated_at: "2026-05-07T00:00:00Z",
      archived_at: null,
      has_content: true,
      content_text: "# Run report",
    };
    const variantGroup = {
      id: "artifact_variant_group_1",
      source_artifact_id: "artifact_1",
      title: "Variants",
      brief: null,
      status: "ready",
      winner_variant_id: null,
      created_at: "2026-05-07T00:00:00Z",
      updated_at: "2026-05-07T00:00:00Z",
      variants: [],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ artifacts: [], total: 0 }))
      .mockResolvedValueOnce(jsonResponse(artifact))
      .mockResolvedValueOnce(jsonResponse(artifact))
      .mockResolvedValueOnce(jsonResponse({ artifact_id: "artifact_1", revisions: [], total: 0 }))
      .mockResolvedValueOnce(jsonResponse({ ...artifact, content_text: "# Previous" }))
      .mockResolvedValueOnce(jsonResponse({ artifact_id: "artifact_1", groups: [variantGroup], total: 1 }))
      .mockResolvedValueOnce(jsonResponse(variantGroup))
      .mockResolvedValueOnce(jsonResponse({ ...variantGroup, variants: [{ id: "artifact_variant_1" }] }))
      .mockResolvedValueOnce(jsonResponse({ ...artifact, content_text: "# Variant" }))
      .mockResolvedValueOnce(jsonResponse({ ...artifact, source: "browser_evidence", type: "report" }))
      .mockResolvedValueOnce(jsonResponse({ ...artifact, archived_at: "2026-05-07T00:01:00Z" }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    await api.listArtifacts({ type: "markdown", search: "run" });
    await api.createArtifact({ title: "Run report", type: "markdown", content_text: "# Run report" });
    await api.linkArtifactToRun("artifact_1", "run-1");
    await api.listArtifactRevisions("artifact_1", true);
    await api.revertArtifact("artifact_1", 1);
    await api.listArtifactVariantGroups("artifact_1");
    await api.createArtifactVariantGroup("artifact_1", { title: "Variants" });
    await api.addArtifactVariant("artifact_variant_group_1", { label: "A", content_text: "# Variant" });
    await api.applyArtifactVariant("artifact_variant_group_1", "artifact_variant_1");
    await api.runArtifactBrowserEvidence("artifact_1");
    await api.archiveArtifact("artifact_1");

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/artifacts?type=markdown&search=run");
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:39191/studio/artifacts");
    expect(fetchMock.mock.calls[2][0]).toBe("http://127.0.0.1:39191/studio/artifacts/artifact_1/link-run");
    expect(fetchMock.mock.calls[3][0]).toBe("http://127.0.0.1:39191/studio/artifacts/artifact_1/revisions?include_content=true");
    expect(fetchMock.mock.calls[4][0]).toBe("http://127.0.0.1:39191/studio/artifacts/artifact_1/revert");
    expect(JSON.parse(fetchMock.mock.calls[4][1].body as string)).toEqual({ version: 1 });
    expect(fetchMock.mock.calls[5][0]).toBe("http://127.0.0.1:39191/studio/artifacts/artifact_1/variant-groups");
    expect(fetchMock.mock.calls[6][0]).toBe("http://127.0.0.1:39191/studio/artifacts/artifact_1/variant-groups");
    expect(fetchMock.mock.calls[7][0]).toBe("http://127.0.0.1:39191/studio/artifact-variant-groups/artifact_variant_group_1/variants");
    expect(fetchMock.mock.calls[8][0]).toBe("http://127.0.0.1:39191/studio/artifact-variant-groups/artifact_variant_group_1/apply");
    expect(JSON.parse(fetchMock.mock.calls[8][1].body as string)).toEqual({ variant_id: "artifact_variant_1" });
    expect(fetchMock.mock.calls[9][0]).toBe("http://127.0.0.1:39191/studio/artifacts/artifact_1/browser-evidence");
    expect(fetchMock.mock.calls[10][0]).toBe("http://127.0.0.1:39191/studio/artifacts/artifact_1/archive");
  });

  it("uses /studio/context/* for Context Inspector calls", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const context = {
      id: "ctx_1",
      scope: "current",
      active_profile: { name: "coder" },
      model: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
      runtime: { backend_status: { backend_mode: "mock" } },
      storage: { available: true },
      workspace: { available: true, path: "/work/repo", name: "repo" },
      session: null,
      run: null,
      memory: { available: false, items: [], warnings: [] },
      skills: { available: false, items: [], warnings: [] },
      context_files: { items: [], warnings: [] },
      related: { artifacts: [], kanban_cards: [], approvals: [], sessions: [], runs: [] },
      warnings: [],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(context))
      .mockResolvedValueOnce(jsonResponse({ ...context, scope: "run" }))
      .mockResolvedValueOnce(jsonResponse({ ...context, scope: "session" }))
      .mockResolvedValueOnce(jsonResponse({ ...context, scope: "workspace" }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    await api.getCurrentContext("/work/repo");
    await api.getRunContext("run-1");
    await api.getSessionContext("s-1");
    await api.getCurrentWorkspaceContext("/work/repo");

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/context/current?workspace_path=%2Fwork%2Frepo");
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer dev-token" }),
      }),
    );
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:39191/studio/context/runs/run-1");
    expect(fetchMock.mock.calls[2][0]).toBe("http://127.0.0.1:39191/studio/context/sessions/s-1");
    expect(fetchMock.mock.calls[3][0]).toBe("http://127.0.0.1:39191/studio/context/workspaces/current?workspace_path=%2Fwork%2Frepo");
  });

  it("uses /studio/hermes/fallbacks for fallback provider inventory", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      fallback_providers: [{ index: 0, provider: "minimax", model: "m2.5", configured: true, active: false, source: "config.yaml" }],
      total: 1,
      summary: { hermes_home: "/home/user/.hermes", config_available: true, provider_count: 1, configured_provider_count: 1, model_count: 1, skill_count: 0, installed_skill_count: 0, mcp_server_count: 0, toolset_count: 0, fallback_provider_count: 1 },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    const result = await api.getHermesFallbacks();

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/hermes/fallbacks");
    expect(result.fallback_providers[0].provider).toBe("minimax");
  });

  it("uses /studio/hermes/doctor for Hermes diagnostics", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      available: true,
      exit_code: 0,
      lines: ["✓ Python 3.11"],
      checks: [{ section: "Python Environment", level: "ok", message: "Python 3.11" }],
      ok_count: 1,
      warning_count: 0,
      error_count: 0,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    const result = await api.getHermesDoctor();

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/hermes/doctor");
    expect(result.checks[0].section).toBe("Python Environment");
  });

  it("uses /studio/hermes/browser-cache for browser automation cache status", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      playwright_cache_dir: "/home/user/.cache/ms-playwright",
      playwright_cache_exists: true,
      playwright_browsers: ["chromium-1217"],
      playwright_chromium_installed: true,
      puppeteer_cache_dir: "/home/user/.cache/puppeteer",
      puppeteer_cache_exists: false,
      puppeteer_browsers: [],
      puppeteer_chrome_installed: false,
      note: "separate caches",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    const result = await api.getHermesBrowserCache();

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/hermes/browser-cache");
    expect(result.playwright_chromium_installed).toBe(true);
  });

  it("uses /studio/hermes/release for Hermes release diagnostics", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      available: true,
      version: "0.13.0",
      update_check_available: true,
      update_available: true,
      up_to_date: false,
      behind_count: 27,
      lines: ["Hermes Agent v0.13.0"],
      update_lines: ["Update available: 27 commits behind upstream/main."],
      error: null,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    const result = await api.getHermesRelease();

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/hermes/release");
    expect(result.behind_count).toBe(27);
  });

  it("uses /studio/hermes/checkpoints/prune for checkpoint store maintenance", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      action: "prune",
      available: true,
      ok: true,
      exit_code: 0,
      duration_ms: 24,
      message: "Pruned checkpoint store",
      lines: ["Pruned checkpoint store"],
      status: { available: true, lines: ["Projects: 0"], status: { projects: "0" } },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    const result = await api.pruneHermesCheckpointStore({ retention_days: 3, max_size_mb: 200, keep_orphans: true });

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/hermes/checkpoints/prune");
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ retention_days: 3, max_size_mb: 200, keep_orphans: true }),
    }));
    expect(result.ok).toBe(true);
  });

  it("uses /studio/hermes/mcp-servers/{id}/test for MCP probes", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      server_id: "fetch",
      available: true,
      ok: false,
      status: "error",
      exit_code: 0,
      duration_ms: 912,
      error: "Connection failed",
      message: "Connection failed",
      lines: ["Testing 'fetch'...", "Connection failed"],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    const result = await api.testHermesMcpServer("fetch");

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/hermes/mcp-servers/fetch/test");
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect(result.status).toBe("error");
  });

  it("uses /studio/hermes/toolsets/configure for Hermes toolset toggles", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      status: "configured",
      id: "browser",
      platform: "cli",
      enabled: true,
      source: "hermes tools",
      toolsets: [{ id: "browser", platform: "cli", kind: "platform", enabled: true, source: "config.yaml" }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    const result = await api.configureHermesToolset({ id: "browser", platform: "cli", enabled: true });

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/hermes/toolsets/configure");
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ id: "browser", platform: "cli", enabled: true }),
    }));
    expect(result.toolsets[0].enabled).toBe(true);
  });

  it("uses /studio/hermes/skills/* for Hermes skill actions", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const skillResult = { action: "check", available: true, ok: true, exit_code: 0, duration_ms: 12, message: "No updates", lines: ["No updates"] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(skillResult))
      .mockResolvedValueOnce(jsonResponse({ ...skillResult, action: "update", skills: [] }))
      .mockResolvedValueOnce(jsonResponse({ ...skillResult, action: "install", skills: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    await api.checkHermesSkills();
    await api.updateHermesSkills("codebase-inspection");
    const installed = await api.installHermesSkill({ identifier: "openai/skills/skill-creator", category: "coding", name: "skill-creator" });

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/hermes/skills/check");
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "POST", body: "{}" }));
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:39191/studio/hermes/skills/update");
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ body: JSON.stringify({ name: "codebase-inspection" }) }));
    expect(fetchMock.mock.calls[2][0]).toBe("http://127.0.0.1:39191/studio/hermes/skills/install");
    expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ identifier: "openai/skills/skill-creator", category: "coding", name: "skill-creator" }),
    }));
    expect(installed.action).toBe("install");
  });

  it("uses /studio/approvals/* for Approval Center calls", async () => {
    vi.stubEnv("VITE_HERMES_STUDIO_ADAPTER_TOKEN", "dev-token");
    const approval = {
      id: "approval-1",
      run_id: "run-1",
      session_id: "s-1",
      tool_name: "shell",
      command: "pytest",
      risk_level: "high",
      status: "pending",
      reason: "Runs tests",
      decision: null,
      decided_at: null,
      created_at: "2026-05-07T00:00:00Z",
      updated_at: "2026-05-07T00:00:00Z",
    };
    const detail = { ...approval, request_payload: { tool: "shell" }, events: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ approvals: [approval], total: 1 }))
      .mockResolvedValueOnce(jsonResponse({ approvals: [approval], total: 1 }))
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(jsonResponse({ approvals: [approval], total: 1 }))
      .mockResolvedValueOnce(jsonResponse({ approvals: [approval], total: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    await api.listApprovals({ status: "pending", risk_level: "high" });
    await api.listPendingApprovals();
    await api.getApproval("approval-1");
    await api.getRunApprovals("run-1");
    await api.getSessionApprovals("s-1");

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/approvals?status=pending&risk_level=high");
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:39191/studio/approvals/pending");
    expect(fetchMock.mock.calls[2][0]).toBe("http://127.0.0.1:39191/studio/approvals/approval-1");
    expect(fetchMock.mock.calls[3][0]).toBe("http://127.0.0.1:39191/studio/runs/run-1/approvals");
    expect(fetchMock.mock.calls[4][0]).toBe("http://127.0.0.1:39191/studio/sessions/s-1/approvals");
  });
});
