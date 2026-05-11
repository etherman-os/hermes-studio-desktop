import { create } from "zustand";
import * as api from "../api/studioClient";
import { useApprovalStore } from "./approvalStore";
import { useKanbanStore } from "./kanbanStore";
import { useRunLedgerStore } from "./runLedgerStore";
import { useNativeStore } from "./nativeStore";
import { toast } from "./toastStore";

let messageIdCounter = 0;
function nextMessageId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolName?: string;
  toolStatus?: "running" | "completed" | "failed";
  toolDuration?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number | null;
  durationMs: number | null;
  model: string | null;
}

interface RunState {
  isStreaming: boolean;
  activeRunId: string | null;
  lastRunId: string | null;
  messages: ChatMessage[];
  abortController: AbortController | null;
  tokenUsage: TokenUsage | null;
  _inactivityTimer: ReturnType<typeof setTimeout> | null;
  _clearInactivityTimer: () => void;
  sendPrompt: (
    prompt: string,
    sessionId: string,
    options?: {
      workspacePath?: string | null;
      mode?: string;
      model?: string;
      provider?: string;
      skills?: string[];
      toolsets?: string[];
      checkpoints?: boolean;
      maxTurns?: number;
      worktree?: boolean;
      passSessionId?: boolean;
      ignoreRules?: boolean;
      ignoreUserConfig?: boolean;
      linkedCardId?: string | null;
    },
  ) => Promise<void>;
  stopRun: () => Promise<void>;
  newChat: () => void;
  appendUserMessage: (content: string) => void;
  appendAssistantChunk: (text: string) => void;
  addToolEvent: (tool: string, status: "running" | "completed" | "failed", duration?: number) => void;
  finalizeRun: () => void;
  setStreaming: (v: boolean) => void;
}

export const useRunStore = create<RunState>((set, get) => ({
  isStreaming: false,
  activeRunId: null,
  lastRunId: null,
  messages: [
    { id: nextMessageId(), role: "assistant" as const, content: "Welcome to Hermes Desktop Studio. How can I help you today?" },
  ],
  abortController: null,
  tokenUsage: null,
  _inactivityTimer: null,

  _clearInactivityTimer: () => {
    const timer = get()._inactivityTimer;
    if (timer !== null) clearTimeout(timer);
    set({ _inactivityTimer: null });
  },

  appendUserMessage: (content) => {
    set((s) => ({ messages: [...s.messages, { id: nextMessageId(), role: "user" as const, content }] }));
  },

  appendAssistantChunk: (text) => {
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant" && last.toolName === undefined) {
        last.content += text;
      } else {
        msgs.push({ id: nextMessageId(), role: "assistant" as const, content: text });
      }
      return { messages: msgs };
    });
  },

  addToolEvent: (tool, status, duration) => {
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextMessageId(), role: "tool" as const, content: tool, toolName: tool, toolStatus: status, toolDuration: duration },
      ],
    }));
  },

  sendPrompt: async (prompt, sessionId, options) => {
    const state = get();
    if (state.isStreaming) return;

    // Clear any existing inactivity timer before starting a new run
    if (state._inactivityTimer !== null) {
      clearTimeout(state._inactivityTimer);
    }

    state.appendUserMessage(prompt);
    useRunLedgerStore.getState().beginPrompt(prompt, sessionId, { workspacePath: options?.workspacePath ?? null });
    set({ isStreaming: true });

    try {
      const run = await api.startRun({
        session_id: sessionId,
        prompt,
        workspace_path: options?.workspacePath ?? null,
        context: {
          workspace_path: options?.workspacePath ?? null,
          run_mode: options?.mode ?? "chat",
          model: options?.model,
          provider: options?.provider,
          skills: options?.skills,
          toolsets: options?.toolsets,
          checkpoints: options?.checkpoints,
          max_turns: options?.maxTurns,
          worktree: options?.worktree,
          pass_session_id: options?.passSessionId,
          ignore_rules: options?.ignoreRules,
          ignore_user_config: options?.ignoreUserConfig,
          linked_card_id: options?.linkedCardId,
        },
      });
      useRunLedgerStore.getState().startRun(run.run_id, prompt, sessionId, run.status, {
        workspacePath: options?.workspacePath ?? null,
      });
      set({ activeRunId: run.run_id, lastRunId: run.run_id });

      // NOTE: Callbacks must call get() to access latest state, never capture `state` via closure.
      // `run` and `sessionId` are safe to close over as they are constants for this execution.

      // Client-side inactivity timer: if no events (including pings) for 60s, treat as disconnected
      const resetInactivityTimer = (existing: ReturnType<typeof setTimeout> | null, rid: string) => {
        if (existing !== null) clearTimeout(existing);
        return setTimeout(() => {
          const s = get();
          if (s.isStreaming && s.activeRunId === rid) {
            s.stopRun();
            get().appendAssistantChunk("\n[Connection lost: inactivity timeout — no events received for 60 seconds.]");
            useRunLedgerStore.getState().finishRun(rid, "failed", "inactivity timeout");
            toast.warn("Connection lost", "Run was stopped because no events were received for 60 seconds.");
          }
        }, 60_000);
      };

      const ac = api.streamRunEvents(run.run_id, {
        onEvent: (event) => {
          useRunLedgerStore.getState().recordEvent(event);
          useApprovalStore.getState().recordEvent(event);
        },
        onAssistantDelta: (p) => get().appendAssistantChunk(p.text),
        onAssistantCompleted: (p) => {
          const prev = get().tokenUsage;
          set({
            tokenUsage: {
              promptTokens: prev?.promptTokens ?? 0,
              completionTokens: (prev?.completionTokens ?? 0) + (p.total_tokens ?? 0),
              totalTokens: (prev?.totalTokens ?? 0) + (p.total_tokens ?? 0),
              cost: prev?.cost ?? null,
              durationMs: p.duration_ms ?? prev?.durationMs ?? null,
              model: p.model ?? prev?.model ?? null,
            },
          });
        },
        onToolStarted: (p) => get().addToolEvent(p.tool, "running"),
        onToolCompleted: (p) => get().addToolEvent(p.tool, "completed", p.duration_ms),
        onKanbanUpdated: () => useKanbanStore.getState().refreshBoard().catch((err) => console.warn("onKanbanUpdated failed:", err)),
        onRunCompleted: (p) => {
          const prev = get().tokenUsage;
          set({
            tokenUsage: {
              promptTokens: prev?.promptTokens ?? 0,
              completionTokens: prev?.completionTokens ?? 0,
              totalTokens: p.total_tokens ?? prev?.totalTokens ?? 0,
              cost: prev?.cost ?? null,
              durationMs: p.duration_ms ?? prev?.durationMs ?? null,
              model: prev?.model ?? null,
            },
          });
          useRunLedgerStore.getState().finishRun(run.run_id, "completed");
          toast.success("Run completed", `Run ${run.run_id.slice(0, 8)} finished successfully`);
          void useNativeStore.getState().sendNotification("Run Completed", `Run ${run.run_id.slice(0, 8)} finished successfully`);
          get().finalizeRun();
        },
        onRunFailed: (p) => {
          get().appendAssistantChunk(`\n[Error: ${p.message}]`);
          useRunLedgerStore.getState().finishRun(run.run_id, "failed", p.message);
          toast.error("Run failed", p.message);
          void useNativeStore.getState().sendNotification("Run Failed", `Run ${run.run_id.slice(0, 8)} failed: ${p.message}`);
          get().finalizeRun();
        },
        onRunCancelled: () => {
          useRunLedgerStore.getState().finishRun(run.run_id, "cancelled");
          get().finalizeRun();
        },
        onRunDisconnected: (p) => {
          const reason = p.reason ?? "inactivity_timeout";
          const message = p.message ?? "Connection lost — no events received for 60 seconds.";
          get().appendAssistantChunk(`\n[Connection lost: ${message}]`);
          useRunLedgerStore.getState().finishRun(run.run_id, "failed", message);
          toast.warn("Connection lost", "Run was stopped because the stream disconnected unexpectedly.");
          api.stopRun(run.run_id).catch(() => {/* ignore */});
          get().finalizeRun();
        },
        onRunInterrupted: (p) => {
          const message = p.message ?? "Stream interrupted.";
          get().appendAssistantChunk(`\n[Stream interrupted: ${message}]`);
          useRunLedgerStore.getState().finishRun(run.run_id, "failed", message);
          toast.warn("Stream interrupted", message);
          get().finalizeRun();
        },
        onPing: () => {
          const currentTimer = get()._inactivityTimer;
          const newTimer = resetInactivityTimer(currentTimer, run.run_id);
          set({ _inactivityTimer: newTimer });
        },
        onError: (err) => {
          get().appendAssistantChunk(`\n[Adapter error: ${err.message}]`);
          useRunLedgerStore.getState().recordLocalWarning(err.message, run.run_id, sessionId);
          useRunLedgerStore.getState().finishRun(run.run_id, "failed", err.message);
          get().finalizeRun();
        },
        onDone: () => {
          const timer = get()._inactivityTimer;
          if (timer !== null) {
            clearTimeout(timer);
          }
          set({ _inactivityTimer: null });
          get().finalizeRun();
        },
      });

      // Start the inactivity timer
      const timer = resetInactivityTimer(null, run.run_id);
      set({ abortController: ac, _inactivityTimer: timer });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      get().appendAssistantChunk(`\n[Failed to start run: ${message}]`);
      const ledger = useRunLedgerStore.getState();
      const pendingRunId = ledger.currentRunId;
      ledger.recordLocalWarning(message, pendingRunId, sessionId);
      if (pendingRunId) ledger.finishRun(pendingRunId, "failed", message);
    } finally {
      get()._clearInactivityTimer();
    }
  },

  stopRun: async () => {
    const { activeRunId, abortController } = get();
    if (abortController) abortController.abort();
    get()._clearInactivityTimer();
    if (activeRunId) {
      try { await api.stopRun(activeRunId); } catch { /* ignore */ }
      useRunLedgerStore.getState().finishRun(activeRunId, "cancelled");
    }
    set({ isStreaming: false, activeRunId: null, abortController: null });
  },

  finalizeRun: () => {
    get()._clearInactivityTimer();
    set({ isStreaming: false, activeRunId: null, abortController: null });
  },

  newChat: () => {
    get()._clearInactivityTimer();
    set({
      messages: [
        { id: nextMessageId(), role: "assistant" as const, content: "New chat ready. Start a run to send work to Hermes through the Studio adapter." },
      ],
      activeRunId: null,
      lastRunId: null,
      abortController: null,
      isStreaming: false,
      tokenUsage: null,
      _inactivityTimer: null,
    });
  },

  setStreaming: (v) => set({ isStreaming: v }),
}));