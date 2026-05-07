import { create } from "zustand";
import type { StudioEvent, StudioEventType } from "../api/studioClient";

export type RunLedgerStatus = "idle" | "starting" | "running" | "completed" | "failed" | "cancelled";

export interface RunRecord {
  runId: string;
  sessionId: string;
  prompt: string;
  status: RunLedgerStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  events: StudioEvent[];
}

interface RunLedgerState {
  runs: RunRecord[];
  currentRunId: string | null;
  selectedEventId: string | null;
  beginPrompt: (prompt: string, sessionId: string) => void;
  startRun: (runId: string, prompt: string, sessionId: string, status?: string) => void;
  recordEvent: (event: StudioEvent) => void;
  recordLocalWarning: (message: string, runId?: string | null, sessionId?: string | null) => void;
  finishRun: (runId: string, status: Exclude<RunLedgerStatus, "idle" | "starting" | "running">, error?: string) => void;
  selectEvent: (eventId: string | null) => void;
  activeRun: () => RunRecord | null;
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

function statusFromRunResponse(status?: string): RunLedgerStatus {
  if (status === "failed" || status === "cancelled" || status === "completed") return status;
  return "running";
}

function upsertEvent(runs: RunRecord[], runId: string, event: StudioEvent): RunRecord[] {
  return runs.map((run) => {
    if (run.runId !== runId) return run;
    const exists = run.events.some((item) => item.id === event.id);
    return { ...run, events: exists ? run.events : [...run.events, event] };
  });
}

export const useRunLedgerStore = create<RunLedgerState>((set, get) => ({
  runs: [],
  currentRunId: null,
  selectedEventId: null,

  beginPrompt: (prompt, sessionId) => {
    const pendingId = `pending_${Date.now()}`;
    const startedAt = isoNow();
    const pending: RunRecord = {
      runId: pendingId,
      sessionId,
      prompt,
      status: "starting",
      startedAt,
      events: [
        makeEvent("adapter.warning", {
          code: "run_starting",
          message: "Run submitted to adapter",
        }, pendingId, sessionId),
      ],
    };
    set((state) => ({
      runs: [pending, ...state.runs.filter((run) => !run.runId.startsWith("pending_"))].slice(0, 20),
      currentRunId: pendingId,
      selectedEventId: pending.events[0]?.id ?? null,
    }));
  },

  startRun: (runId, prompt, sessionId, status) => {
    const startedAt = isoNow();
    const startEvent = makeEvent("run.started", { run_id: runId, session_id: sessionId }, runId, sessionId);
    set((state) => ({
      runs: [
        {
          runId,
          sessionId,
          prompt,
          status: statusFromRunResponse(status),
          startedAt,
          events: [startEvent],
        },
        ...state.runs.filter((run) => run.runId !== runId && !run.runId.startsWith("pending_")),
      ].slice(0, 20),
      currentRunId: runId,
      selectedEventId: startEvent.id,
    }));
  },

  recordEvent: (event) => {
    const runId = event.run_id ?? get().currentRunId;
    if (!runId) return;

    set((state) => {
      let runs = upsertEvent(state.runs, runId, event);
      runs = runs.map((run) => {
        if (run.runId !== runId) return run;
        if (event.type === "run.completed") return { ...run, status: "completed", completedAt: event.timestamp };
        if (event.type === "run.failed") {
          const message = typeof event.payload.message === "string" ? event.payload.message : "Run failed";
          return { ...run, status: "failed", completedAt: event.timestamp, error: message };
        }
        if (event.type === "run.cancelled") return { ...run, status: "cancelled", completedAt: event.timestamp };
        return run.status === "starting" ? { ...run, status: "running" } : run;
      });
      return {
        runs,
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
        runs: [localRun, ...state.runs].slice(0, 20),
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

  selectEvent: (eventId) => set({ selectedEventId: eventId }),

  activeRun: () => {
    const { runs, currentRunId } = get();
    return runs.find((run) => run.runId === currentRunId) ?? null;
  },

  lastRun: () => get().runs[0] ?? null,
}));
