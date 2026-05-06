export interface KanbanBoardSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface KanbanBoard extends KanbanBoardSummary {
  columns: KanbanColumn[];
  card_count: number;
}

export interface KanbanColumn {
  id: string;
  board_id: string;
  name: string;
  semantic_status: string;
  position: number;
  created_at: string;
  updated_at: string;
  cards: KanbanCard[];
}

export interface KanbanCard {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  position: number;
  session_id: string | null;
  run_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface KanbanCardEvent {
  id: string;
  card_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface KanbanBoardsResponse {
  boards: KanbanBoardSummary[];
}

export interface KanbanCreateCardRequest {
  board_id?: string;
  column_id?: string;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  position?: number;
  session_id?: string | null;
  run_id?: string | null;
}

export interface KanbanUpdateCardRequest {
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
}

export interface KanbanMoveCardRequest {
  column_id: string;
  position: number;
}

export interface KanbanLinkSessionRequest {
  session_id: string;
}

export interface KanbanLinkRunRequest {
  run_id: string;
}
