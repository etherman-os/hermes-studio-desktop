export type EventType =
  | "run.started"
  | "assistant.delta"
  | "assistant.completed"
  | "tool.started"
  | "tool.progress"
  | "tool.completed"
  | "approval.requested"
  | "approval.resolved"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "log.line"
  | "adapter.warning"
  | "kanban.updated"
  | "memory.updated";

export type EventSource = "adapter" | "hermes" | "studio";

export interface StudioEvent<P = Record<string, unknown>> {
  id: string;
  type: EventType;
  run_id?: string;
  session_id?: string;
  timestamp: string;
  source: EventSource;
  payload: P;
}

export interface RunStartedPayload {
  run_id: string;
  session_id: string;
  profile?: string;
}

export interface AssistantDeltaPayload {
  text: string;
  model?: string;
  token_count?: number;
}

export interface AssistantCompletedPayload {
  model?: string;
  total_tokens?: number;
  duration_ms?: number;
}

export interface ToolStartedPayload {
  tool: string;
  tool_call_id?: string;
  input?: Record<string, unknown>;
}

export interface ToolProgressPayload {
  tool: string;
  tool_call_id?: string;
  progress?: number;
  message?: string;
}

export interface ToolCompletedPayload {
  tool: string;
  tool_call_id?: string;
  output?: unknown;
  success: boolean;
  duration_ms?: number;
}

export interface ApprovalRequestedPayload {
  approval_id: string;
  tool: string;
  action: string;
  description?: string;
  risk_level?: "low" | "medium" | "high";
}

export interface ApprovalResolvedPayload {
  approval_id: string;
  decision: "approved" | "denied";
  auto?: boolean;
}

export interface RunCompletedPayload {
  run_id: string;
  total_tokens?: number;
  duration_ms?: number;
  tool_count?: number;
}

export interface RunFailedPayload {
  run_id: string;
  error_code?: string;
  message: string;
  retryable?: boolean;
  hint?: string;
}

export interface RunCancelledPayload {
  run_id: string;
  reason?: string;
}

export interface LogLinePayload {
  source: "agent" | "errors" | "gateway";
  message: string;
  level?: "debug" | "info" | "warn" | "error";
  session_context?: string;
}

export interface AdapterWarningPayload {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface KanbanUpdatedPayload {
  board_id: string;
  action: string;
  card_id?: string;
  column_id?: string;
  position?: number;
  /** Legacy alias retained only for compatibility; new Kanban events use card_id. */
  task_id?: string;
}

export interface MemoryUpdatedPayload {
  session_id?: string;
  action: "created" | "updated" | "deleted";
  artifact_id?: string;
}

export type EventPayloadMap = {
  "run.started": RunStartedPayload;
  "assistant.delta": AssistantDeltaPayload;
  "assistant.completed": AssistantCompletedPayload;
  "tool.started": ToolStartedPayload;
  "tool.progress": ToolProgressPayload;
  "tool.completed": ToolCompletedPayload;
  "approval.requested": ApprovalRequestedPayload;
  "approval.resolved": ApprovalResolvedPayload;
  "run.completed": RunCompletedPayload;
  "run.failed": RunFailedPayload;
  "run.cancelled": RunCancelledPayload;
  "log.line": LogLinePayload;
  "adapter.warning": AdapterWarningPayload;
  "kanban.updated": KanbanUpdatedPayload;
  "memory.updated": MemoryUpdatedPayload;
};

export type TypedStudioEvent<T extends EventType = EventType> = StudioEvent<
  T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>
>;
