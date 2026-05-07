export type DelegationStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

export interface DelegationRunSummary {
  id: string;
  session_id: string | null;
  status: string;
  title: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface Delegation {
  id: string;
  parent_run_id: string;
  child_run_id: string;
  status: DelegationStatus;
  tool_name: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  session_id: string | null;
}

export interface DelegationDetail extends Delegation {
  parent_run: DelegationRunSummary;
  child_run: DelegationRunSummary;
}

export interface DelegationListResponse {
  delegations: Delegation[];
  total: number;
  source: string;
}
