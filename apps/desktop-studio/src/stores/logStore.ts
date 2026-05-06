import { create } from "zustand";
import * as api from "../api/studioClient";

interface LogLine {
  timestamp?: string;
  level: string;
  message: string;
  source: string;
}

interface LogState {
  lines: LogLine[];
  sources: string[];
  selectedSource: string;
  loaded: boolean;
  streaming: boolean;
  error: string | null;
  abortController: AbortController | null;
  loadRecent: (source?: string) => Promise<void>;
  setSource: (source: string) => void;
  startStream: (source?: string) => void;
  stopStream: () => void;
  clear: () => void;
}

function parseLogLine(raw: string, source: string): LogLine {
  const levelMatch = raw.match(/\[(ERROR|WARN|INFO|DEBUG)\]/i);
  const level = levelMatch ? levelMatch[1].toLowerCase() : "info";
  const tsMatch = raw.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
  return {
    timestamp: tsMatch ? tsMatch[1] : undefined,
    level,
    message: raw,
    source,
  };
}

export const useLogStore = create<LogState>((set, get) => ({
  lines: [],
  sources: [],
  selectedSource: "agent.log",
  loaded: false,
  streaming: false,
  error: null,
  abortController: null,

  loadRecent: async (source?: string) => {
    try {
      const data = await api.getLogs(source ?? get().selectedSource);
      const lines = data.lines.map((l) => parseLogLine(l, data.source));
      set({
        lines,
        sources: data.source ? [data.source] : get().sources,
        loaded: true,
        error: null,
      });
    } catch (err) {
      set({ loaded: true, error: err instanceof Error ? err.message : "Failed to load logs" });
    }
  },

  setSource: (source: string) => {
    set({ selectedSource: source, lines: [] });
    get().loadRecent(source);
  },

  startStream: (source?: string) => {
    const state = get();
    if (state.streaming) return;

    const ac = api.streamLogs({
      onLogLine: (payload) => {
        const line: LogLine = {
          timestamp: payload.timestamp,
          level: payload.level ?? "info",
          message: payload.message,
          source: payload.source ?? source ?? "unknown",
        };
        set((s) => ({ lines: [...s.lines.slice(-500), line] }));
      },
      onError: (err) => {
        set({ error: err.message, streaming: false });
      },
    });

    set({ streaming: true, abortController: ac });
  },

  stopStream: () => {
    const { abortController } = get();
    if (abortController) abortController.abort();
    set({ streaming: false, abortController: null });
  },

  clear: () => {
    set({ lines: [], error: null });
  },
}));
