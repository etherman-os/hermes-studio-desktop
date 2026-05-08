import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Approval, ApprovalDetail, StudioEvent } from "../api/studioClient";
import * as api from "../api/studioClient";
import { useApprovalStore } from "./approvalStore";

vi.mock("../api/studioClient", async () => {
  const actual = await vi.importActual<typeof import("../api/studioClient")>("../api/studioClient");
  return {
    ...actual,
    listApprovals: vi.fn(),
    listPendingApprovals: vi.fn(),
    getApproval: vi.fn(),
    getRunApprovals: vi.fn(),
    getSessionApprovals: vi.fn(),
    approveApproval: vi.fn(),
    denyApproval: vi.fn(),
  };
});

const approval: Approval = {
  id: "approval-1",
  run_id: "run-1",
  session_id: "s-1",
  tool_name: "shell",
  command: "pytest",
  risk_level: "high",
  status: "pending",
  reason: "Runs tests",
  decision: null,
  decided_at: null,
  created_at: "2026-05-07T00:00:00Z",
  updated_at: "2026-05-07T00:00:00Z",
};

const detail: ApprovalDetail = {
  ...approval,
  request_payload: { approval_id: "approval-1", tool: "shell", action: "pytest" },
  events: [],
};

function resetStore() {
  useApprovalStore.setState({
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
  });
}

function event(type: "approval.requested" | "approval.resolved", payload: Record<string, unknown>): StudioEvent {
  return {
    id: `evt-${type}`,
    type,
    run_id: "run-1",
    session_id: "s-1",
    timestamp: "2026-05-07T00:00:00Z",
    source: "adapter",
    payload,
  };
}

describe("approvalStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("loads pending approvals", async () => {
    vi.mocked(api.listPendingApprovals).mockResolvedValue({ approvals: [approval], total: 1 });

    await useApprovalStore.getState().loadPendingApprovals();

    expect(api.listPendingApprovals).toHaveBeenCalledOnce();
    expect(useApprovalStore.getState().pending[0].id).toBe("approval-1");
    expect(useApprovalStore.getState().error).toBeNull();
  });

  it("loads approval detail", async () => {
    vi.mocked(api.getApproval).mockResolvedValue(detail);

    await useApprovalStore.getState().loadApprovalDetail("approval-1");

    expect(api.getApproval).toHaveBeenCalledWith("approval-1");
    expect(useApprovalStore.getState().selectedApproval?.request_payload?.tool).toBe("shell");
  });

  it("loads approvals for a run", async () => {
    vi.mocked(api.getRunApprovals).mockResolvedValue({ approvals: [approval], total: 1 });
    vi.mocked(api.getApproval).mockResolvedValue(detail);

    await useApprovalStore.getState().loadApprovalsForRun("run-1");

    expect(api.getRunApprovals).toHaveBeenCalledWith("run-1");
    expect(useApprovalStore.getState().approvals[0].run_id).toBe("run-1");
  });

  it("approves a pending approval", async () => {
    vi.mocked(api.approveApproval).mockResolvedValue({
      ...detail,
      status: "approved",
      decision: "approved",
      decided_at: "2026-05-07T00:01:00Z",
    });
    useApprovalStore.setState({ pending: [approval], approvals: [approval] });

    await useApprovalStore.getState().approveApproval("approval-1");

    expect(api.approveApproval).toHaveBeenCalledWith("approval-1");
    expect(useApprovalStore.getState().pending).toEqual([]);
    expect(useApprovalStore.getState().approvals[0].status).toBe("approved");
  });

  it("records live requested and resolved events", () => {
    useApprovalStore.getState().recordEvent(event("approval.requested", {
      approval_id: "approval-live",
      tool: "shell",
      action: "git status",
      risk_level: "medium",
    }));

    expect(useApprovalStore.getState().pending[0].id).toBe("approval-live");
    expect(useApprovalStore.getState().pending[0].risk_level).toBe("medium");

    useApprovalStore.getState().recordEvent(event("approval.resolved", {
      approval_id: "approval-live",
      decision: "denied",
    }));

    expect(useApprovalStore.getState().pending).toEqual([]);
    expect(useApprovalStore.getState().approvals[0].status).toBe("denied");
  });

  it("sets an error when the adapter is unavailable", async () => {
    vi.mocked(api.listApprovals).mockRejectedValue(new Error("Adapter auth token is unavailable"));

    await useApprovalStore.getState().loadApprovals();

    expect(useApprovalStore.getState().error).toBe("Adapter auth token is unavailable");
  });
});
