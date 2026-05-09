import type { StudioEvent } from "./events";

export type RunLedgerStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "stopping"
  | "idle";

export interface RunLedgerRun {
  id: string;
  session_id: string | null;
  status: RunLedgerStatus;
  title: string | null;
  prompt_preview: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  backend: string;
  model: string | null;
  error: string | null;
  workspace_path: string | null;
}

export type RunLedgerEvent = StudioEvent;

export interface RunLedgerRecentResponse {
  runs: RunLedgerRun[];
  total: number;
  history_available: boolean;
}

export interface RunLedgerResponse {
  run: RunLedgerRun;
  events: RunLedgerEvent[];
  history_available: boolean;
}

export interface RunLedgerCompareSummary {
  run_id: string | null;
  status: string | null;
  backend: string | null;
  model: string | null;
  workspace_path: string | null;
  duration_ms: number | null;
  event_count: number;
  event_type_counts: Record<string, number>;
  tool_names: string[];
  warning_count: number;
  error_count: number;
  approval_count: number;
  assistant_chars: number;
}

export interface RunLedgerCompareDelta {
  status_changed: boolean;
  model_changed: boolean;
  backend_changed: boolean;
  duration_delta_ms: number | null;
  event_count_delta: number;
  warning_delta: number;
  error_delta: number;
  assistant_char_delta: number;
  added_tools: string[];
  removed_tools: string[];
  event_type_delta: Record<string, number>;
}

export interface RunLedgerComparison {
  left: RunLedgerCompareSummary;
  right: RunLedgerCompareSummary;
  delta: RunLedgerCompareDelta;
  history_available: boolean;
}
