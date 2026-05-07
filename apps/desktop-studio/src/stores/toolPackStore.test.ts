import { describe, it, expect, vi, beforeEach } from "vitest";
import { useToolPackStore } from "./toolPackStore";

vi.mock("../api/studioClient", () => ({
  getToolPacks: vi.fn(),
  enableToolPack: vi.fn(),
  disableToolPack: vi.fn(),
  installToolPack: vi.fn(),
}));

import * as api from "../api/studioClient";

const mockPacks = {
  packs: [
    {
      id: "example-tools",
      name: "Example Tools",
      version: "1.0.0",
      author: "Hermes Studio",
      description: "Example pack",
      commands: [
        { id: "list-files", name: "List Files", description: "List files", command: "ls -la" },
        { id: "git-status", name: "Git Status", description: "Git status", command: "git status" },
      ],
      trusted: true,
      permissions: ["filesystem:read"],
      compat: { platform: ["linux", "macos"] },
      enabled: false,
      valid: true,
      warnings: [],
      compatible: true,
    },
    {
      id: "untrusted-pack",
      name: "Untrusted",
      version: "0.1.0",
      author: "unknown",
      description: "",
      commands: [{ id: "run", name: "Run", description: "", command: "echo run" }],
      trusted: false,
      permissions: [],
      compat: {},
      enabled: false,
      valid: true,
      warnings: [],
      compatible: true,
    },
  ],
};

describe("toolPackStore", () => {
  beforeEach(() => {
    useToolPackStore.setState({
      packs: [],
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  it("loadPacks fetches packs from API", async () => {
    vi.mocked(api.getToolPacks).mockResolvedValue(mockPacks);

    await useToolPackStore.getState().loadPacks();

    const state = useToolPackStore.getState();
    expect(state.packs).toHaveLength(2);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("loadPacks handles errors", async () => {
    vi.mocked(api.getToolPacks).mockRejectedValue(new Error("Network error"));

    await useToolPackStore.getState().loadPacks();

    const state = useToolPackStore.getState();
    expect(state.packs).toHaveLength(0);
    expect(state.error).toBe("Network error");
    expect(state.loading).toBe(false);
  });

  it("enablePack enables a pack", async () => {
    useToolPackStore.setState({ packs: [...mockPacks.packs] });

    const enabledPack = { ...mockPacks.packs[0], enabled: true };
    vi.mocked(api.enableToolPack).mockResolvedValue(enabledPack);

    await useToolPackStore.getState().enablePack("example-tools");

    const state = useToolPackStore.getState();
    const pack = state.packs.find((p) => p.id === "example-tools");
    expect(pack?.enabled).toBe(true);
  });

  it("disablePack disables a pack", async () => {
    const enabledPacks = mockPacks.packs.map((p) => ({ ...p, enabled: true }));
    useToolPackStore.setState({ packs: enabledPacks });

    const disabledPack = { ...mockPacks.packs[0], enabled: false };
    vi.mocked(api.disableToolPack).mockResolvedValue(disabledPack);

    await useToolPackStore.getState().disablePack("example-tools");

    const state = useToolPackStore.getState();
    const pack = state.packs.find((p) => p.id === "example-tools");
    expect(pack?.enabled).toBe(false);
  });

  it("installPack adds a new pack", async () => {
    useToolPackStore.setState({ packs: [] });

    const newPack = mockPacks.packs[0];
    vi.mocked(api.installToolPack).mockResolvedValue(newPack);

    await useToolPackStore.getState().installPack("/path/to/pack");

    const state = useToolPackStore.getState();
    expect(state.packs).toHaveLength(1);
    expect(state.packs[0].id).toBe("example-tools");
  });

  it("installPack updates existing pack", async () => {
    useToolPackStore.setState({ packs: [mockPacks.packs[0]] });

    const updatedPack = { ...mockPacks.packs[0], version: "2.0.0" };
    vi.mocked(api.installToolPack).mockResolvedValue(updatedPack);

    await useToolPackStore.getState().installPack("/path/to/pack");

    const state = useToolPackStore.getState();
    expect(state.packs).toHaveLength(1);
    expect(state.packs[0].version).toBe("2.0.0");
  });

  it("clearError clears the error", () => {
    useToolPackStore.setState({ error: "Some error" });
    useToolPackStore.getState().clearError();
    expect(useToolPackStore.getState().error).toBeNull();
  });
});
