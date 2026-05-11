import { create } from "zustand";
import * as api from "../api/studioClient";

interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  profile?: string;
}

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  searchQuery: string;
  sessionSource: string;
  loaded: boolean;
  setActiveSession: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  loadFromAdapter: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  searchQuery: "",
  sessionSource: "unavailable",
  loaded: false,

  setActiveSession: (id) => set({ activeSessionId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  loadFromAdapter: async () => {
    try {
      const data = await api.getSessions();
      const sessions = data.sessions.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        messageCount: s.message_count,
      }));
      set({
        sessions,
        sessionSource: data.source ?? "mock",
        loaded: true,
        activeSessionId: sessions.length > 0 ? sessions[0].id : null,
      });
    } catch {
      set({ sessionSource: "unavailable", loaded: true });
    }
  },
}));
