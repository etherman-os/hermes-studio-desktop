import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRunLedgerStore } from "./runLedgerStore";
import type { StudioEvent } from "../api/studioClient";
import * as api from "../api/studioClient";

vi.mock("../api/studioClient", async () => {
  const actual = await vi.importActual<typeof import("../api/studioClient")>("../api/studioClient");
  return {
    ...actual,
    getRecentRuns: vi.fn(),
    getRunLedger: vi.fn(),
    createKanbanCard: vi.fn(),
    getDefaultKanbanBoard: vi.fn(),
  };
});

function resetStore() {
  useRunLedgerStore.setState({
    runs: [],
    currentRunId: null,
    selectedRunId: null,
    selectedEventId: null,
    loading: false,
    error: null,
    historyAvailable: true,
    savingRunCard: false,
    actionMessage: null,
  });
}

function event(type: StudioEvent["type"], payload: Record<string, unknown> = {}): StudioEvent {
  return {
    id: `${type}-1`,
    type,
    run_id: "run-1",
    session_id: "session-1",
    timestamp: "2026-05-07T00:00:00Z",
    source: "hermes",
    payload,
  };
}

describe("runLedgerStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a run with a synthetic run.started event", () => {
    useRunLedgerStore.getState().startRun("run-1", "check repo", "session-1", "started");

    const run = useRunLedgerStore.getState().runs[0];

    expect(run.runId).toBe("run-1");
    expect(run.status).toBe("running");
    expect(run.events[0].type).toBe("run.started");
    expect(useRunLedgerStore.getState().selectedRunId).toBe("run-1");
  });

  it("records stream events and completes the selected run", () => {
    useRunLedgerStore.getState().startRun("run-1", "check repo", "session-1", "started");
    useRunLedgerStore.getState().recordEvent(event("assistant.delta", { text: "Done" }));
    useRunLedgerStore.getState().recordEvent(event("run.completed", { run_id: "run-1" }));

    const run = useRunLedgerStore.getState().runs[0];

    expect(run.events.map((item) => item.type)).toContain("assistant.delta");
    expect(run.status).toBe("completed");
  });

  it("stores local adapter warnings when no run exists", () => {
    useRunLedgerStore.getState().recordLocalWarning("Adapter offline");

    const run = useRunLedgerStore.getState().runs[0];

    expect(run.status).toBe("idle");
    expect(run.events[0].type).toBe("adapter.warning");
  });

  it("loads recent persisted runs", async () => {
    vi.mocked(api.getRecentRuns).mockResolvedValue({
      runs: [
        {
          id: "run-1",
          session_id: "session-1",
          status: "completed",
          title: "Check repo",
          prompt_preview: "Check repo",
          started_at: "2026-05-07T00:00:00Z",
          completed_at: "2026-05-07T00:00:10Z",
          duration_ms: 10000,
          backend: "mock",
          model: "mock-model",
          error: null,
          workspace_path: "/work/project",
        },
      ],
      total: 1,
      history_available: true,
    });

    await useRunLedgerStore.getState().loadRecentRuns();

    const state = useRunLedgerStore.getState();
    expect(state.runs[0].runId).toBe("run-1");
    expect(state.runs[0].status).toBe("completed");
    expect(state.runs[0].workspacePath).toBe("/work/project");
    expect(state.selectedRunId).toBe("run-1");
    expect(state.error).toBeNull();
  });

  it("handles empty recent run history", async () => {
    vi.mocked(api.getRecentRuns).mockResolvedValue({
      runs: [],
      total: 0,
      history_available: true,
    });

    await useRunLedgerStore.getState().loadRecentRuns();

    expect(useRunLedgerStore.getState().runs).toEqual([]);
    expect(useRunLedgerStore.getState().historyAvailable).toBe(true);
  });

  it("creates a Kanban card from a run", async () => {
    useRunLedgerStore.getState().startRun("run-1", "check repo", "session-1", "started");
    useRunLedgerStore.getState().recordEvent(event("assistant.delta", { text: "Done" }));
    vi.mocked(api.createKanbanCard).mockResolvedValue({
      id: "card-1",
      board_id: "board_default",
      column_id: "col_default_inbox",
      title: "check repo",
      description: "",
      priority: "medium",
      status: "inbox",
      position: 0,
      session_id: "session-1",
      run_id: "run-1",
      created_at: "2026-05-07T00:00:00Z",
      updated_at: "2026-05-07T00:00:00Z",
      archived_at: null,
    });
    vi.mocked(api.getDefaultKanbanBoard).mockResolvedValue({
      id: "board_default",
      name: "Default Board",
      created_at: "2026-05-07T00:00:00Z",
      updated_at: "2026-05-07T00:00:00Z",
      card_count: 1,
      columns: [],
    });

    await useRunLedgerStore.getState().createCardFromRun("run-1");

    expect(api.createKanbanCard).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "check repo",
        run_id: "run-1",
        session_id: "session-1",
      }),
    );
    expect(useRunLedgerStore.getState().actionMessage).toBe("Kanban card created in Inbox");
  });
});
