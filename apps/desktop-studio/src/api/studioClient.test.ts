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

    const api = await loadClient();
    await api.checkAdapterHealthDetailed();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/health");
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
      }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadClient();
    await api.initializeAdapterAuth();
    await api.getRecentRuns();
    await api.getRunLedger("run-1");

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:39191/studio/runs/recent?limit=50");
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:39191/studio/runs/run-1/ledger");
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
