import { create } from "zustand";
import * as api from "../api/studioClient";
import type {
  KanbanBoard,
  KanbanBoardSummary,
  KanbanCard,
  KanbanCreateCardRequest,
  KanbanMoveCardRequest,
  KanbanUpdateCardRequest,
} from "../api/studioClient";

type KanbanAction = "load" | "create" | "update" | "move" | "archive" | "link";

interface KanbanState {
  boards: KanbanBoardSummary[];
  activeBoard: KanbanBoard | null;
  activeBoardId: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  actionMessage: string | null;
  lastLoadedAt: string | null;
  lastAction: KanbanAction | null;
  loadBoards: () => Promise<void>;
  loadDefaultBoard: () => Promise<void>;
  loadBoard: (boardId: string) => Promise<void>;
  refreshBoard: () => Promise<void>;
  createCard: (input: KanbanCreateCardRequest) => Promise<KanbanCard | null>;
  updateCard: (cardId: string, input: KanbanUpdateCardRequest) => Promise<KanbanCard | null>;
  moveCard: (cardId: string, input: KanbanMoveCardRequest) => Promise<KanbanCard | null>;
  archiveCard: (cardId: string) => Promise<KanbanCard | null>;
  linkCardToSession: (cardId: string, sessionId: string) => Promise<KanbanCard | null>;
  linkCardToRun: (cardId: string, runId: string) => Promise<KanbanCard | null>;
  clearActionMessage: () => void;
}

function messageFromError(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function updateBoardCard(board: KanbanBoard | null, card: KanbanCard) {
  if (!board || board.id !== card.board_id) return board;
  const columns = board.columns.map((column) => {
    const withoutCard = column.cards.filter((item) => item.id !== card.id);
    if (column.id !== card.column_id || card.archived_at) {
      return { ...column, cards: withoutCard };
    }
    return {
      ...column,
      cards: [...withoutCard, card].sort((a, b) => a.position - b.position),
    };
  });
  return {
    ...board,
    columns,
    card_count: columns.reduce((total, column) => total + column.cards.length, 0),
    updated_at: card.updated_at,
  };
}

export const useKanbanStore = create<KanbanState>((set, get) => ({
  boards: [],
  activeBoard: null,
  activeBoardId: null,
  loading: false,
  saving: false,
  error: null,
  actionMessage: null,
  lastLoadedAt: null,
  lastAction: null,

  loadBoards: async () => {
    set({ loading: true, error: null, lastAction: "load" });
    try {
      const data = await api.getKanbanBoards();
      set({ boards: data.boards, loading: false, lastLoadedAt: nowIso() });
    } catch (err) {
      set({ loading: false, error: messageFromError(err, "Kanban boards unavailable") });
    }
  },

  loadDefaultBoard: async () => {
    set({ loading: true, error: null, lastAction: "load" });
    try {
      const board = await api.getDefaultKanbanBoard();
      set({
        activeBoard: board,
        activeBoardId: board.id,
        loading: false,
        lastLoadedAt: nowIso(),
      });
    } catch (err) {
      set({
        activeBoard: null,
        loading: false,
        error: messageFromError(err, "Kanban board unavailable"),
      });
    }
  },

  loadBoard: async (boardId) => {
    set({ loading: true, error: null, lastAction: "load" });
    try {
      const board = await api.getKanbanBoard(boardId);
      set({
        activeBoard: board,
        activeBoardId: board.id,
        loading: false,
        lastLoadedAt: nowIso(),
      });
    } catch (err) {
      set({ loading: false, error: messageFromError(err, "Kanban board unavailable") });
    }
  },

  refreshBoard: async () => {
    const boardId = get().activeBoardId;
    if (boardId) {
      await get().loadBoard(boardId);
      return;
    }
    await get().loadDefaultBoard();
  },

  createCard: async (input) => {
    set({ saving: true, error: null, actionMessage: null, lastAction: "create" });
    try {
      const card = await api.createKanbanCard(input);
      set((state) => ({
        activeBoard: updateBoardCard(state.activeBoard, card),
        saving: false,
        actionMessage: "Kanban card created",
      }));
      await get().refreshBoard();
      return card;
    } catch (err) {
      set({
        saving: false,
        error: messageFromError(err, "Failed to create Kanban card"),
      });
      return null;
    }
  },

  updateCard: async (cardId, input) => {
    set({ saving: true, error: null, actionMessage: null, lastAction: "update" });
    try {
      const card = await api.updateKanbanCard(cardId, input);
      set((state) => ({
        activeBoard: updateBoardCard(state.activeBoard, card),
        saving: false,
        actionMessage: "Kanban card updated",
      }));
      return card;
    } catch (err) {
      set({
        saving: false,
        error: messageFromError(err, "Failed to update Kanban card"),
      });
      return null;
    }
  },

  moveCard: async (cardId, input) => {
    set({ saving: true, error: null, actionMessage: null, lastAction: "move" });
    try {
      const card = await api.moveKanbanCard(cardId, input);
      set((state) => ({
        activeBoard: updateBoardCard(state.activeBoard, card),
        saving: false,
        actionMessage: "Kanban card moved",
      }));
      await get().refreshBoard();
      return card;
    } catch (err) {
      set({
        saving: false,
        error: messageFromError(err, "Failed to move Kanban card"),
      });
      return null;
    }
  },

  archiveCard: async (cardId) => {
    set({ saving: true, error: null, actionMessage: null, lastAction: "archive" });
    try {
      const card = await api.archiveKanbanCard(cardId);
      set((state) => ({
        activeBoard: updateBoardCard(state.activeBoard, card),
        saving: false,
        actionMessage: "Kanban card archived",
      }));
      await get().refreshBoard();
      return card;
    } catch (err) {
      set({
        saving: false,
        error: messageFromError(err, "Failed to archive Kanban card"),
      });
      return null;
    }
  },

  linkCardToSession: async (cardId, sessionId) => {
    set({ saving: true, error: null, actionMessage: null, lastAction: "link" });
    try {
      const card = await api.linkKanbanCardToSession(cardId, sessionId);
      set((state) => ({
        activeBoard: updateBoardCard(state.activeBoard, card),
        saving: false,
        actionMessage: "Kanban card linked to session",
      }));
      return card;
    } catch (err) {
      set({
        saving: false,
        error: messageFromError(err, "Failed to link Kanban card to session"),
      });
      return null;
    }
  },

  linkCardToRun: async (cardId, runId) => {
    set({ saving: true, error: null, actionMessage: null, lastAction: "link" });
    try {
      const card = await api.linkKanbanCardToRun(cardId, runId);
      set((state) => ({
        activeBoard: updateBoardCard(state.activeBoard, card),
        saving: false,
        actionMessage: "Kanban card linked to run",
      }));
      return card;
    } catch (err) {
      set({
        saving: false,
        error: messageFromError(err, "Failed to link Kanban card to run"),
      });
      return null;
    }
  },

  clearActionMessage: () => set({ actionMessage: null }),
}));
