import type { Approval } from "./approvals";
import type { Artifact } from "./artifacts";
import type { KanbanCard } from "./kanban";
import type { RunLedgerRun } from "./runs";

export type ContextScope = "current" | "run" | "session" | "workspace";

export interface ContextWorkspace {
  available: boolean;
  path: string | null;
  name: string | null;
}

export interface ContextCollection {
  available: boolean;
  items: Record<string, unknown>[];
  total?: number;
  warnings: string[];
}

export interface ContextFile {
  name: string;
  path: string | null;
  available: boolean;
  preview?: string | null;
  warning?: string;
  redacted?: boolean;
}

export interface ContextFiles {
  items: ContextFile[];
  warnings: string[];
}

export interface ContextRelated {
  artifacts: Artifact[];
  kanban_cards: KanbanCard[];
  approvals: Approval[];
  sessions: Record<string, unknown>[];
  runs: RunLedgerRun[];
}

export interface ContextSnapshot {
  id: string;
  scope: ContextScope;
  active_profile: Record<string, unknown> | null;
  model: Record<string, unknown> | null;
  runtime?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  workspace: ContextWorkspace;
  session: Record<string, unknown> | null;
  run: RunLedgerRun | null;
  memory: ContextCollection;
  skills: ContextCollection;
  context_files: ContextFiles;
  related: ContextRelated;
  warnings: string[];
}
