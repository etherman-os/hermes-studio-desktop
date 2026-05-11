import { create } from "zustand";
import * as api from "../api/studioClient";
import type { RunLedgerRun, StudioEvent, StudioEventType } from "../api/studioClient";
import { useKanbanStore } from "./kanbanStore";

export type RunLedgerStatus = "idle" | "queued" | "starting" | "running" | "completed" | "failed" | "cancelled" | "stopping";

export interface RunRecord {
  runId: string;
  sessionId: string | null;
  prompt: string;
  status: RunLedgerStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  backend?: string;
  model?: string;
  error?: string;
  workspacePath?: string | null;
  events: StudioEvent[];
}

interface RunLedgerState {
  runs: RunRecord[];
  currentRunId: string | null;
  selectedRunId: string | null;
  selectedEventId: string | null;
  loading: boolean;
  error: string | null;
  historyAvailable: boolean;
  savingRunCard: boolean;
  actionMessage: string | null;
  comparison: api.RunLedgerComparison | null;
  comparingRuns: boolean;
  loadRecentRuns: () => Promise<void>;
  loadRunLedger: (runId: string) => Promise<void>;
  compareRuns: (leftRunId: string, rightRunId: string) => Promise<void>;
  beginPrompt: (prompt: string, sessionId: string, options?: { workspacePath?: string | null }) => void;
  startRun: (runId: string, prompt: string, sessionId: string, status?: string, options?: { workspacePath?: string | null }) => void;
  recordEvent: (event: StudioEvent) => void;
  recordLocalWarning: (message: string, runId?: string | null, sessionId?: string | null) => void;
  finishRun: (runId: string, status: Exclude<RunLedgerStatus, "idle" | "queued" | "starting" | "running" | "stopping">, error?: string) => void;
  createCardFromRun: (runId: string) => Promise<void>;
  selectRun: (runId: string | null) => void;
  selectEvent: (eventId: string | null) => void;
  clearActionMessage: () => void;
  activeRun: () => RunRecord | null;
  selectedRun: () => RunRecord | null;
  lastRun: () => RunRecord | null;
}

function isoNow() {
  return new Date().toISOString();
}

function makeEvent(
  type: StudioEventType,
  payload: Record<string, unknown>,
  runId?: string | null,
  sessionId?: string | null,
): StudioEvent {
  return {
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    run_id: runId ?? undefined,
    session_id: sessionId ?? undefined,
    timestamp: isoNow(),
    source: "studio",
    payload,
  };
}

function normalizeStatus(status?: string | null): RunLedgerStatus {
  if (status === "started") return "running";
  if (
    status === "idle"
    || status === "queued"
    || status === "starting"
    || status === "running"
    || status === "completed"
    || status === "failed"
    || status === "cancelled"
    || status === "stopping"
  ) {
    return status;
  }
  return "running";
}

function fromPersistedRun(run: RunLedgerRun, events: StudioEvent[] = []): RunRecord {
  return {
    runId: run.id,
    sessionId: run.session_id,
    prompt: run.prompt_preview ?? run.title ?? "",
    status: normalizeStatus(run.status),
    startedAt: run.started_at,
    completedAt: run.completed_at ?? undefined,
    durationMs: run.duration_ms ?? undefined,
    backend: run.backend,
    model: run.model ?? undefined,
    error: run.error ?? undefined,
    workspacePath: run.workspace_path ?? null,
    events,
  };
}

function upsertRun(runs: RunRecord[], next: RunRecord): RunRecord[] {
  const without = runs.filter((run) => run.runId !== next.runId);
  return [next, ...without].slice(0, 50);
}

function upsertEvent(runs: RunRecord[], runId: string, event: StudioEvent): RunRecord[] {
  return runs.map((run) => {
    if (run.runId !== runId) return run;
    const exists = run.events.some((item) => item.id === event.id);
    if (exists) return run;
    // Guard against out-of-order events by checking timestamps
    // Only add event if its timestamp is >= the latest event's timestamp in the run
    if (run.events.length > 0) {
      const latestTimestamp = run.events[run.events.length - 1].timestamp;
      if (event.timestamp < latestTimestamp) return run;
    }
    return { ...run, events: [...run.events, event] };
  });
}

function runSummary(run: RunRecord) {
  const assistantText = run.events
    .filter((event) => event.type === "assistant.delta" && typeof event.payload.text === "string")
    .map((event) => event.payload.text)
    .join("")
    .trim();
  const toolNames = Array.from(new Set(
    run.events
      .filter((event) => event.type === "tool.started" || event.type === "tool.completed")
      .map((event) => String(event.payload.tool ?? "tool")),
  ));
  const error = run.error ? `\nError: ${run.error}` : "";
  const workspace = run.workspacePath ? `\nWorkspace: ${run.workspacePath}` : "";
  const tools = toolNames.length ? `\nTools: ${toolNames.join(", ")}` : "";
  const result = assistantText ? `\nAssistant: ${assistantText.slice(0, 700)}` : "";
  return `Run ${run.runId}\nStatus: ${run.status}\nSession: ${run.sessionId ?? "none"}${workspace}${tools}${error}${result}`;
}

export const useRunLedgerStore = create<RunLedgerState>((set, get) => ({
  runs: [],
  currentRunId: null,
  selectedRunId: null,
  selectedEventId: null,
  loading: false,
  error: null,
  historyAvailable: true,
  savingRunCard: false,
  actionMessage: null,
  comparison: null,
  comparingRuns: false,

  loadRecentRuns: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getRecentRuns();
      set((state) => {
        const existing = new Map(state.runs.map((run) => [run.runId, run]));
        const persisted = data.runs.map((run) => {
          const current = existing.get(run.id);
          return fromPersistedRun(run, current?.events ?? []);
        });
        const persistedIds = new Set(persisted.map((run) => run.runId));
        const liveOnly = state.runs.filter((run) => !persistedIds.has(run.runId) && (run.status === "starting" || run.status === "running"));
        const runs = [...liveOnly, ...persisted].slice(0, 50);
        return {
          runs,
          selectedRunId: state.selectedRunId ?? state.currentRunId ?? runs[0]?.runId ?? null,
          loading: false,
          error: null,
          historyAvailable: data.history_available,
        };
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        historyAvailable: false,
      });
    }
  },

  loadRunLedger: async (runId) => {
    set({ loading: true, error: null });
    try {
      const data = await api.getRunLedger(runId);
      const record = fromPersistedRun(data.run, data.events);
      set((state) => ({
        runs: upsertRun(state.runs, record),
        selectedRunId: record.runId,
        selectedEventId: record.events[0]?.id ?? state.selectedEventId,
        loading: false,
        error: null,
        historyAvailable: data.history_available,
      }));
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        historyAvailable: false,
      });
    }
  },

  compareRuns: async (leftRunId, rightRunId) => {
    set({ comparingRuns: true, error: null });
    try {
      const comparison = await api.compareRuns(leftRunId, rightRunId);
      set({ comparison, comparingRuns: false, historyAvailable: comparison.history_available });
    } catch (err) {
      set({
        comparingRuns: false,
        error: err instanceof Error ? err.message : String(err),
        historyAvailable: false,
      });
    }
  },

  beginPrompt: (prompt, sessionId, options) => {
    const pendingId = `pending_${Date.now()}`;
    const startedAt = isoNow();
    const pending: RunRecord = {
      runId: pendingId,
      sessionId,
      prompt,
      status: "starting",
      startedAt,
      workspacePath: options?.workspacePath ?? null,
      events: [
        makeEvent("adapter.warning", {
          code: "run_starting",
          message: "Run submitted to adapter",
        }, pendingId, sessionId),
      ],
    };
    set((state) => ({
      runs: [pending, ...state.runs.filter((run) => !run.runId.startsWith("pending_"))].slice(0, 50),
      currentRunId: pendingId,
      selectedRunId: pendingId,
      selectedEventId: pending.events[0]?.id ?? null,
    }));
  },

  startRun: (runId, prompt, sessionId, status, options) => {
    const startedAt = isoNow();
    const startEvent = makeEvent("run.started", { run_id: runId, session_id: sessionId }, runId, sessionId);
    const run: RunRecord = {
      runId,
      sessionId,
      prompt,
      status: normalizeStatus(status),
      startedAt,
      workspacePath: options?.workspacePath ?? null,
      events: [startEvent],
    };
    set((state) => ({
      runs: [
        run,
        ...state.runs.filter((item) => item.runId !== runId && !item.runId.startsWith("pending_")),
      ].slice(0, 50),
      currentRunId: runId,
      selectedRunId: runId,
      selectedEventId: startEvent.id,
    }));
  },

  recordEvent: (event) => {
    const runId = event.run_id ?? get().currentRunId;
    if (!runId) return;

    set((state) => {
      const existing = state.runs.find((run) => run.runId === runId);
      const runsWithTarget = existing
        ? state.runs
        : [{
          runId,
          sessionId: event.session_id ?? null,
          prompt: "",
          status: "running" as const,
          startedAt: event.timestamp,
          events: [],
        }, ...state.runs];
      let runs = upsertEvent(runsWithTarget, runId, event);
      runs = runs.map((run) => {
        if (run.runId !== runId) return run;
        if (event.type === "assistant.completed") {
          const model = typeof event.payload.model === "string" ? event.payload.model : run.model;
          const durationMs = typeof event.payload.duration_ms === "number" ? event.payload.duration_ms : run.durationMs;
          return { ...run, model, durationMs };
        }
        if (event.type === "run.completed") {
          const durationMs = typeof event.payload.duration_ms === "number" ? event.payload.duration_ms : run.durationMs;
          return { ...run, status: "completed", completedAt: event.timestamp, durationMs };
        }
        if (event.type === "run.failed") {
          const message = typeof event.payload.message === "string" ? event.payload.message : "Run failed";
          return { ...run, status: "failed", completedAt: event.timestamp, error: message };
        }
        if (event.type === "run.cancelled") return { ...run, status: "cancelled", completedAt: event.timestamp };
        return run.status === "starting" ? { ...run, status: "running" } : run;
      });
      return {
        runs,
        selectedRunId: state.selectedRunId ?? runId,
        selectedEventId: state.selectedEventId ?? event.id,
      };
    });
  },

  recordLocalWarning: (message, runId, sessionId) => {
    const targetRunId = runId ?? get().currentRunId;
    const event = makeEvent("adapter.warning", { code: "studio_notice", message }, targetRunId, sessionId);
    if (!targetRunId) {
      const localRun: RunRecord = {
        runId: `local_${Date.now()}`,
        sessionId: sessionId ?? "local",
        prompt: "",
        status: "idle",
        startedAt: event.timestamp,
        events: [event],
      };
      set((state) => ({
        runs: [localRun, ...state.runs].slice(0, 50),
        selectedRunId: localRun.runId,
        selectedEventId: event.id,
      }));
      return;
    }
    get().recordEvent(event);
  },

  finishRun: (runId, status, error) => {
    const completedAt = isoNow();
    set((state) => ({
      runs: state.runs.map((run) => (
        run.runId === runId ? { ...run, status, error, completedAt } : run
      )),
      currentRunId: state.currentRunId === runId ? null : state.currentRunId,
    }));
  },

  createCardFromRun: async (runId) => {
    const run = get().runs.find((item) => item.runId === runId);
    if (!run) {
      set({ actionMessage: "Run not found" });
      return;
    }
    set({ savingRunCard: true, actionMessage: null });
    try {
      const title = (run.prompt || run.runId).slice(0, 120);
      await api.createKanbanCard({
        title,
        description: runSummary(run),
        priority: run.status === "failed" ? "high" : "medium",
        run_id: run.runId,
        session_id: run.sessionId,
      });
      await useKanbanStore.getState().refreshBoard();
      set({ savingRunCard: false, actionMessage: "Kanban card created in Inbox" });
    } catch (err) {
      set({
        savingRunCard: false,
        actionMessage: err instanceof Error ? err.message : String(err),
      });
    }
  },

  selectRun: (runId) => {
    const run = get().runs.find((item) => item.runId === runId);
    set({
      selectedRunId: runId,
      selectedEventId: run?.events[0]?.id ?? null,
    });
  },

  selectEvent: (eventId) => set({ selectedEventId: eventId }),
  clearActionMessage: () => set({ actionMessage: null }),

  activeRun: () => {
    const { runs, currentRunId } = get();
    return runs.find((run) => run.runId === currentRunId) ?? null;
  },

  selectedRun: () => {
    const { runs, selectedRunId, currentRunId } = get();
    return runs.find((run) => run.runId === selectedRunId) ?? runs.find((run) => run.runId === currentRunId) ?? runs[0] ?? null;
  },

  lastRun: () => get().runs[0] ?? null,
}));
