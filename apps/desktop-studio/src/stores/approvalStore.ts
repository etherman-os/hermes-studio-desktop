import { create } from "zustand";
import type {
  Approval,
  ApprovalDetail,
  ApprovalListParams,
  ApprovalRiskLevel,
  ApprovalStatus,
  StudioEvent,
} from "../api/studioClient";
import * as api from "../api/studioClient";
import { useNativeStore } from "./nativeStore";

type ApprovalFilter = "all" | "pending" | "approved" | "denied" | "high_risk";

interface ApprovalState {
  approvals: Approval[];
  pending: Approval[];
  selectedApproval: ApprovalDetail | null;
  selectedApprovalId: string | null;
  filter: ApprovalFilter;
  loading: boolean;
  saving: boolean;
  error: string | null;
  actionMessage: string | null;
  lastLoadedAt: string | null;
  loadApprovals: (params?: ApprovalListParams) => Promise<void>;
  loadPendingApprovals: () => Promise<void>;
  loadApprovalDetail: (approvalId: string) => Promise<void>;
  loadApprovalsForRun: (runId: string) => Promise<void>;
  loadApprovalsForSession: (sessionId: string) => Promise<void>;
  approveApproval: (approvalId: string) => Promise<void>;
  denyApproval: (approvalId: string) => Promise<void>;
  recordEvent: (event: StudioEvent) => void;
  setFilter: (filter: ApprovalFilter) => void;
  clearActionMessage: () => void;
}

function messageFromError(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function riskFromPayload(payload: Record<string, unknown>): ApprovalRiskLevel {
  const raw = text(payload.risk_level ?? payload.risk ?? payload.severity)?.toLowerCase();
  if (raw === "low" || raw === "medium" || raw === "high" || raw === "critical") return raw;
  return "unknown";
}

function statusFromDecision(decision: string | null): ApprovalStatus {
  if (decision === "approved" || decision === "denied" || decision === "expired" || decision === "cancelled") return decision;
  return "unknown";
}

function statusRank(status: ApprovalStatus) {
  if (status === "pending") return 0;
  if (status === "unknown") return 1;
  return 2;
}

function sortApprovals(items: Approval[]) {
  return [...items].sort((a, b) => {
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    return b.created_at.localeCompare(a.created_at);
  });
}

function upsertApproval(list: Approval[], approval: Approval) {
  const exists = list.some((item) => item.id === approval.id);
  const next = exists
    ? list.map((item) => (item.id === approval.id ? mergeApproval(item, approval) : item))
    : [approval, ...list];
  return sortApprovals(next).slice(0, 100);
}

function mergeApproval(existing: Approval, incoming: Approval): Approval {
  return {
    ...existing,
    ...incoming,
    run_id: incoming.run_id ?? existing.run_id,
    session_id: incoming.session_id ?? existing.session_id,
    tool_name: incoming.tool_name ?? existing.tool_name,
    command: incoming.command ?? existing.command,
    reason: incoming.reason ?? existing.reason,
    risk_level: incoming.risk_level === "unknown" ? existing.risk_level : incoming.risk_level,
  };
}

function detailFromApproval(approval: Approval, payload: Record<string, unknown> | null): ApprovalDetail {
  return {
    ...approval,
    request_payload: payload,
    events: [],
  };
}

function approvalFromEvent(event: StudioEvent): { approval: Approval; detail: ApprovalDetail } | null {
  if (event.type !== "approval.requested" && event.type !== "approval.resolved") return null;
  const payload = event.payload as Record<string, unknown>;
  const approvalId = text(payload.approval_id) ?? event.id;
  const runId = text(event.run_id ?? payload.run_id);
  const sessionId = text(event.session_id ?? payload.session_id);
  const existingDecision = text(payload.decision)?.toLowerCase();
  const decision = event.type === "approval.resolved" ? existingDecision ?? "unknown" : null;
  const status: ApprovalStatus = event.type === "approval.requested" ? "pending" : statusFromDecision(decision);
  const approval: Approval = {
    id: approvalId,
    run_id: runId,
    session_id: sessionId,
    tool_name: text(payload.tool_name ?? payload.tool),
    command: text(payload.command ?? payload.action),
    risk_level: riskFromPayload(payload),
    status,
    reason: text(payload.reason ?? payload.description ?? payload.message),
    decision,
    decided_at: event.type === "approval.resolved" ? event.timestamp : null,
    created_at: event.timestamp,
    updated_at: event.timestamp,
  };
  return { approval, detail: detailFromApproval(approval, payload) };
}

function paramsForFilter(filter: ApprovalFilter): ApprovalListParams {
  if (filter === "pending") return { status: "pending" };
  if (filter === "approved") return { status: "approved" };
  if (filter === "denied") return { status: "denied" };
  if (filter === "high_risk") return { risk_level: "high" };
  return {};
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  approvals: [],
  pending: [],
  selectedApproval: null,
  selectedApprovalId: null,
  filter: "all",
  loading: false,
  saving: false,
  error: null,
  actionMessage: null,
  lastLoadedAt: null,

  loadApprovals: async (params) => {
    const effective = { limit: 100, ...paramsForFilter(get().filter), ...params };
    set({ loading: true, error: null });
    try {
      const data = await api.listApprovals(effective);
      set((state) => ({
        approvals: data.approvals,
        selectedApprovalId: state.selectedApprovalId ?? data.approvals[0]?.id ?? null,
        loading: false,
        lastLoadedAt: nowIso(),
      }));
      const selectedId = get().selectedApprovalId;
      if (selectedId) {
        try {
          await get().loadApprovalDetail(selectedId);
        } catch {
          // Detail load failure is non-fatal; list is already displayed
        }
      }
    } catch (err) {
      set({ loading: false, error: messageFromError(err, "Approvals unavailable") });
    }
  },

  loadPendingApprovals: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.listPendingApprovals();
      set((state) => ({
        pending: data.approvals,
        approvals: sortApprovals([...data.approvals, ...state.approvals.filter((item) => item.status !== "pending")]).slice(0, 100),
        loading: false,
        lastLoadedAt: nowIso(),
      }));
    } catch (err) {
      set({ loading: false, error: messageFromError(err, "Pending approvals unavailable") });
    }
  },

  loadApprovalDetail: async (approvalId) => {
    set({ selectedApprovalId: approvalId, error: null });
    try {
      const approval = await api.getApproval(approvalId);
      set((state) => ({
        selectedApproval: approval,
        selectedApprovalId: approval.id,
        approvals: upsertApproval(state.approvals, approval),
        pending: approval.status === "pending"
          ? upsertApproval(state.pending, approval)
          : state.pending.filter((item) => item.id !== approval.id),
      }));
    } catch (err) {
      set({ error: messageFromError(err, "Approval detail unavailable") });
    }
  },

  loadApprovalsForRun: async (runId) => {
    set({ loading: true, error: null, filter: "all" });
    try {
      const data = await api.getRunApprovals(runId);
      set({
        approvals: data.approvals,
        selectedApprovalId: data.approvals[0]?.id ?? null,
        loading: false,
        lastLoadedAt: nowIso(),
        actionMessage: `Showing approvals for run ${runId}`,
      });
      if (data.approvals[0]) {
        try {
          await get().loadApprovalDetail(data.approvals[0].id);
        } catch (err) {
          console.warn("loadApprovalsForRun: failed to load approval detail", data.approvals[0].id, err);
        }
      }
    } catch (err) {
      set({ loading: false, error: messageFromError(err, "Run approvals unavailable") });
    }
  },

  loadApprovalsForSession: async (sessionId) => {
    set({ loading: true, error: null, filter: "all" });
    try {
      const data = await api.getSessionApprovals(sessionId);
      set({
        approvals: data.approvals,
        selectedApprovalId: data.approvals[0]?.id ?? null,
        loading: false,
        lastLoadedAt: nowIso(),
        actionMessage: `Showing approvals for session ${sessionId}`,
      });
      if (data.approvals[0]) {
        try {
          await get().loadApprovalDetail(data.approvals[0].id);
        } catch (err) {
          console.warn("loadApprovalsForSession: failed to load approval detail", data.approvals[0].id, err);
        }
      }
    } catch (err) {
      set({ loading: false, error: messageFromError(err, "Session approvals unavailable") });
    }
  },

  approveApproval: async (approvalId) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const approval = await api.approveApproval(approvalId);
      set((state) => ({
        saving: false,
        actionMessage: `Approved ${approvalId}`,
        selectedApproval: approval,
        selectedApprovalId: approval.id,
        approvals: upsertApproval(state.approvals, approval),
        pending: state.pending.filter((item) => item.id !== approval.id),
      }));
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Approval failed") });
    }
  },

  denyApproval: async (approvalId) => {
    set({ saving: true, error: null, actionMessage: null });
    try {
      const approval = await api.denyApproval(approvalId);
      set((state) => ({
        saving: false,
        actionMessage: `Denied ${approvalId}`,
        selectedApproval: approval,
        selectedApprovalId: approval.id,
        approvals: upsertApproval(state.approvals, approval),
        pending: state.pending.filter((item) => item.id !== approval.id),
      }));
    } catch (err) {
      set({ saving: false, error: messageFromError(err, "Denial failed") });
    }
  },

  recordEvent: (event) => {
    const normalized = approvalFromEvent(event);
    if (!normalized) return;
    if (event.type === "approval.requested") {
      const toolName = normalized.approval.tool_name ?? "unknown tool";
      void useNativeStore.getState().sendNotification(
        "Approval Required",
        `${toolName} needs approval`,
      );
    }
    set((state) => ({
      approvals: upsertApproval(state.approvals, normalized.approval),
      pending: normalized.approval.status === "pending"
        ? upsertApproval(state.pending, normalized.approval)
        : state.pending.filter((item) => item.id !== normalized.approval.id),
      selectedApproval: state.selectedApprovalId === normalized.approval.id
        ? { ...normalized.detail, events: state.selectedApproval?.events ?? [] }
        : state.selectedApproval,
      selectedApprovalId: state.selectedApprovalId ?? normalized.approval.id,
      actionMessage: event.type === "approval.requested" ? "Approval request captured" : "Approval decision captured",
    }));
  },

  setFilter: (filter) => {
    set({ filter, actionMessage: null });
    void get().loadApprovals(paramsForFilter(filter));
  },

  clearActionMessage: () => set({ actionMessage: null }),
}));
