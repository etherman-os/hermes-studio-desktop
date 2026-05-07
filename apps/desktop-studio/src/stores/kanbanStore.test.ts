import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KanbanBoard, KanbanCard } from "../api/studioClient";
import * as api from "../api/studioClient";
import { useKanbanStore } from "./kanbanStore";

vi.mock("../api/studioClient", async () => {
  const actual = await vi.importActual<typeof import("../api/studioClient")>("../api/studioClient");
  return {
    ...actual,
    getKanbanBoards: vi.fn(),
    getDefaultKanbanBoard: vi.fn(),
    getKanbanBoard: vi.fn(),
    createKanbanCard: vi.fn(),
    updateKanbanCard: vi.fn(),
    moveKanbanCard: vi.fn(),
    archiveKanbanCard: vi.fn(),
    linkKanbanCardToSession: vi.fn(),
    linkKanbanCardToRun: vi.fn(),
  };
});

const baseCard: KanbanCard = {
  id: "card-1",
  board_id: "board_default",
  column_id: "col_default_inbox",
  title: "Investigate failure",
  description: "Created from run",
  priority: "medium",
  status: "inbox",
  position: 0,
  session_id: null,
  run_id: "run-1",
  created_at: "2026-05-07T00:00:00Z",
  updated_at: "2026-05-07T00:00:00Z",
  archived_at: null,
};

function board(cards: KanbanCard[] = []): KanbanBoard {
  return {
    id: "board_default",
    name: "Default Board",
    created_at: "2026-05-07T00:00:00Z",
    updated_at: "2026-05-07T00:00:00Z",
    card_count: cards.length,
    columns: [
      {
        id: "col_default_inbox",
        board_id: "board_default",
        name: "Inbox",
        semantic_status: "inbox",
        position: 0,
        created_at: "2026-05-07T00:00:00Z",
        updated_at: "2026-05-07T00:00:00Z",
        cards: cards.filter((card) => card.column_id === "col_default_inbox" && !card.archived_at),
      },
      {
        id: "col_default_doing",
        board_id: "board_default",
        name: "Doing",
        semantic_status: "doing",
        position: 1,
        created_at: "2026-05-07T00:00:00Z",
        updated_at: "2026-05-07T00:00:00Z",
        cards: cards.filter((card) => card.column_id === "col_default_doing" && !card.archived_at),
      },
    ],
  };
}

function resetStore() {
  useKanbanStore.setState({
    boards: [],
    activeBoard: null,
    activeBoardId: null,
    loading: false,
    saving: false,
    error: null,
    actionMessage: null,
    lastLoadedAt: null,
    lastAction: null,
  });
}

describe("kanbanStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("loads the default board", async () => {
    vi.mocked(api.getDefaultKanbanBoard).mockResolvedValue(board([baseCard]));

    await useKanbanStore.getState().loadDefaultBoard();

    expect(api.getDefaultKanbanBoard).toHaveBeenCalledOnce();
    expect(useKanbanStore.getState().activeBoard?.card_count).toBe(1);
    expect(useKanbanStore.getState().error).toBeNull();
  });

  it("creates a card and refreshes the active board", async () => {
    useKanbanStore.setState({ activeBoard: board(), activeBoardId: "board_default" });
    vi.mocked(api.createKanbanCard).mockResolvedValue(baseCard);
    vi.mocked(api.getKanbanBoard).mockResolvedValue(board([baseCard]));

    await useKanbanStore.getState().createCard({ title: "Investigate failure", priority: "medium" });

    expect(api.createKanbanCard).toHaveBeenCalledWith({ title: "Investigate failure", priority: "medium" });
    expect(api.getKanbanBoard).toHaveBeenCalledWith("board_default");
    expect(useKanbanStore.getState().activeBoard?.columns[0].cards[0].id).toBe("card-1");
  });

  it("moves a card between columns", async () => {
    const moved = { ...baseCard, column_id: "col_default_doing", status: "doing", position: 0 };
    useKanbanStore.setState({ activeBoard: board([baseCard]), activeBoardId: "board_default" });
    vi.mocked(api.moveKanbanCard).mockResolvedValue(moved);
    vi.mocked(api.getKanbanBoard).mockResolvedValue(board([moved]));

    await useKanbanStore.getState().moveCard("card-1", { column_id: "col_default_doing", position: 0 });

    expect(api.moveKanbanCard).toHaveBeenCalledWith("card-1", { column_id: "col_default_doing", position: 0 });
    expect(useKanbanStore.getState().activeBoard?.columns[1].cards[0].column_id).toBe("col_default_doing");
  });

  it("archives a card out of the active board", async () => {
    const archived = { ...baseCard, archived_at: "2026-05-07T00:01:00Z" };
    useKanbanStore.setState({ activeBoard: board([baseCard]), activeBoardId: "board_default" });
    vi.mocked(api.archiveKanbanCard).mockResolvedValue(archived);
    vi.mocked(api.getKanbanBoard).mockResolvedValue(board());

    await useKanbanStore.getState().archiveCard("card-1");

    expect(api.archiveKanbanCard).toHaveBeenCalledWith("card-1");
    expect(useKanbanStore.getState().activeBoard?.card_count).toBe(0);
  });

  it("sets an error when the adapter is unavailable", async () => {
    vi.mocked(api.getDefaultKanbanBoard).mockRejectedValue(new Error("Adapter auth token is unavailable"));

    await useKanbanStore.getState().loadDefaultBoard();

    expect(useKanbanStore.getState().activeBoard).toBeNull();
    expect(useKanbanStore.getState().error).toBe("Adapter auth token is unavailable");
  });
});
