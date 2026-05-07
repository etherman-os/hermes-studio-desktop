import { describe, it, expect, vi, beforeEach } from "vitest";
import { useProcessStore } from "./processStore";

vi.mock("../api/studioClient", () => ({
  listProcesses: vi.fn(),
  startProcess: vi.fn(),
  stopProcess: vi.fn(),
  getProcessLogs: vi.fn(),
  removeProcess: vi.fn(),
}));

import * as api from "../api/studioClient";

const mockProcesses = {
  processes: [
    {
      id: "proc-1",
      template_id: "dev-server",
      name: "Hermes Dev Server",
      command: "pnpm run dev:desktop",
      status: "running" as const,
      pid: 12345,
      started_at: "2026-05-08T10:00:00Z",
      stopped_at: null,
      exit_code: null,
      log_count: 10,
      error: null,
    },
  ],
  templates: [
    { id: "dev-server", name: "Hermes Dev Server", command: "pnpm run dev:desktop", description: "Dev server" },
    { id: "adapter", name: "Python Adapter", command: "pnpm run dev:adapter", description: "Adapter" },
  ],
};

describe("processStore", () => {
  beforeEach(() => {
    useProcessStore.setState({
      processes: [],
      templates: [],
      loading: false,
      error: null,
      selectedProcessId: null,
      processLogs: {},
    });
    vi.clearAllMocks();
  });

  it("loadProcesses fetches processes and templates", async () => {
    vi.mocked(api.listProcesses).mockResolvedValue(mockProcesses);

    await useProcessStore.getState().loadProcesses();

    const state = useProcessStore.getState();
    expect(state.processes).toHaveLength(1);
    expect(state.templates).toHaveLength(2);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("loadProcesses sets error on failure", async () => {
    vi.mocked(api.listProcesses).mockRejectedValue(new Error("Connection failed"));

    await useProcessStore.getState().loadProcesses();

    const state = useProcessStore.getState();
    expect(state.error).toBe("Connection failed");
    expect(state.loading).toBe(false);
  });

  it("startProcess adds new process to list", async () => {
    const newProc = {
      id: "proc-new",
      template_id: "dev-server",
      name: "Hermes Dev Server",
      command: "pnpm run dev:desktop",
      status: "running" as const,
      pid: 99999,
      started_at: "2026-05-08T11:00:00Z",
      stopped_at: null,
      exit_code: null,
      log_count: 0,
      error: null,
    };
    vi.mocked(api.startProcess).mockResolvedValue(newProc);

    await useProcessStore.getState().startProcess("dev-server");

    const state = useProcessStore.getState();
    expect(state.processes).toHaveLength(1);
    expect(state.processes[0].id).toBe("proc-new");
    expect(state.selectedProcessId).toBe("proc-new");
  });

  it("stopProcess updates process status", async () => {
    useProcessStore.setState({ processes: mockProcesses.processes });

    const stoppedProc = { ...mockProcesses.processes[0], status: "stopped" as const, stopped_at: "2026-05-08T10:30:00Z" };
    vi.mocked(api.stopProcess).mockResolvedValue(stoppedProc);

    await useProcessStore.getState().stopProcess("proc-1");

    const state = useProcessStore.getState();
    expect(state.processes[0].status).toBe("stopped");
  });

  it("loadLogs populates processLogs", async () => {
    vi.mocked(api.getProcessLogs).mockResolvedValue({
      process_id: "proc-1",
      lines: ["line1", "line2"],
      total: 2,
    });

    await useProcessStore.getState().loadLogs("proc-1");

    const state = useProcessStore.getState();
    expect(state.processLogs["proc-1"]).toEqual(["line1", "line2"]);
  });

  it("removeProcess removes from list", async () => {
    useProcessStore.setState({ processes: mockProcesses.processes, selectedProcessId: "proc-1" });
    vi.mocked(api.removeProcess).mockResolvedValue({ removed: true });

    await useProcessStore.getState().removeProcess("proc-1");

    const state = useProcessStore.getState();
    expect(state.processes).toHaveLength(0);
    expect(state.selectedProcessId).toBeNull();
  });

  it("selectProcess sets selectedProcessId and loads logs", async () => {
    useProcessStore.setState({ processes: mockProcesses.processes });
    vi.mocked(api.getProcessLogs).mockResolvedValue({ process_id: "proc-1", lines: [], total: 0 });

    useProcessStore.getState().selectProcess("proc-1");

    expect(useProcessStore.getState().selectedProcessId).toBe("proc-1");
  });

  it("clearError resets error state", () => {
    useProcessStore.setState({ error: "some error" });

    useProcessStore.getState().clearError();

    expect(useProcessStore.getState().error).toBeNull();
  });
});
