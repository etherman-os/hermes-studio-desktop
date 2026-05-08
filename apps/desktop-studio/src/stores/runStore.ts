import { create } from "zustand";
import * as api from "../api/studioClient";
import { useApprovalStore } from "./approvalStore";
import { useKanbanStore } from "./kanbanStore";
import { useRunLedgerStore } from "./runLedgerStore";
import { useNativeStore } from "./nativeStore";

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
        },
      });
      useRunLedgerStore.getState().startRun(run.run_id, prompt, sessionId, run.status, {
        workspacePath: options?.workspacePath ?? null,
      });
      set({ activeRunId: run.run_id, lastRunId: run.run_id });

      // NOTE: Callbacks must call get() to access latest state, never capture `state` via closure.
      // `run` and `sessionId` are safe to close over as they are constants for this execution.
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
        onKanbanUpdated: () => void useKanbanStore.getState().refreshBoard(),
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
          void useNativeStore.getState().sendNotification("Run Completed", `Run ${run.run_id.slice(0, 8)} finished successfully`);
          get().finalizeRun();
        },
        onRunFailed: (p) => {
          get().appendAssistantChunk(`\n[Error: ${p.message}]`);
          useRunLedgerStore.getState().finishRun(run.run_id, "failed", p.message);
          void useNativeStore.getState().sendNotification("Run Failed", `Run ${run.run_id.slice(0, 8)} failed: ${p.message}`);
          get().finalizeRun();
        },
        onRunCancelled: () => {
          useRunLedgerStore.getState().finishRun(run.run_id, "cancelled");
          get().finalizeRun();
        },
        onError: (err) => {
          get().appendAssistantChunk(`\n[Adapter error: ${err.message}]`);
          useRunLedgerStore.getState().recordLocalWarning(err.message, run.run_id, sessionId);
          useRunLedgerStore.getState().finishRun(run.run_id, "failed", err.message);
          get().finalizeRun();
        },
        onDone: () => get().finalizeRun(),
      });

      set({ abortController: ac });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      get().appendAssistantChunk(`\n[Failed to start run: ${message}]`);
      const ledger = useRunLedgerStore.getState();
      const pendingRunId = ledger.currentRunId;
      ledger.recordLocalWarning(message, pendingRunId, sessionId);
      if (pendingRunId) ledger.finishRun(pendingRunId, "failed", message);
      set({ isStreaming: false });
    }
  },

  stopRun: async () => {
    const { activeRunId, abortController } = get();
    if (abortController) abortController.abort();
    if (activeRunId) {
      try { await api.stopRun(activeRunId); } catch { /* ignore */ }
      useRunLedgerStore.getState().finishRun(activeRunId, "cancelled");
    }
    set({ isStreaming: false, activeRunId: null, abortController: null });
  },

  finalizeRun: () => {
    set({ isStreaming: false, activeRunId: null, abortController: null });
  },

  newChat: () => {
    set({
      messages: [
        { id: nextMessageId(), role: "assistant" as const, content: "New chat ready. Start a run to send work to Hermes through the Studio adapter." },
      ],
      activeRunId: null,
      lastRunId: null,
      abortController: null,
      isStreaming: false,
      tokenUsage: null,
    });
  },

  setStreaming: (v) => set({ isStreaming: v }),
}));
