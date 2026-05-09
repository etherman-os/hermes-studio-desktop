import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactDetail } from "../api/studioClient";
import * as api from "../api/studioClient";
import { useArtifactStore } from "./artifactStore";

vi.mock("../api/studioClient", async () => {
  const actual = await vi.importActual<typeof import("../api/studioClient")>("../api/studioClient");
  return {
    ...actual,
    listArtifacts: vi.fn(),
    getArtifact: vi.fn(),
    createArtifact: vi.fn(),
    updateArtifact: vi.fn(),
    revertArtifact: vi.fn(),
    createArtifactVariantGroup: vi.fn(),
    addArtifactVariant: vi.fn(),
    applyArtifactVariant: vi.fn(),
    archiveArtifact: vi.fn(),
    runArtifactBrowserEvidence: vi.fn(),
    linkArtifactToRun: vi.fn(),
    linkArtifactToSession: vi.fn(),
    linkArtifactToCard: vi.fn(),
  };
});

const artifact: ArtifactDetail = {
  id: "artifact_1",
  title: "Run summary",
  type: "markdown",
  description: "Summary",
  file_path: null,
  file_name: null,
  mime_type: null,
  size_bytes: null,
  run_id: "run-1",
  session_id: null,
  kanban_card_id: null,
  source: "run",
  created_at: "2026-05-07T00:00:00Z",
  updated_at: "2026-05-07T00:00:00Z",
  archived_at: null,
  has_content: true,
  content_text: "# Summary",
  events: [],
  variant_groups: [],
};

const variantGroup = {
  id: "artifact_variant_group_1",
  source_artifact_id: "artifact_1",
  title: "Variants",
  brief: null,
  status: "ready" as const,
  winner_variant_id: null,
  created_at: "2026-05-07T00:00:00Z",
  updated_at: "2026-05-07T00:00:00Z",
  variants: [],
};

function resetStore() {
  useArtifactStore.setState({
    artifacts: [],
    selectedArtifact: null,
    selectedArtifactId: null,
    loading: false,
    saving: false,
    error: null,
    actionMessage: null,
    filterType: "all",
    search: "",
    lastLoadedAt: null,
  });
}

describe("artifactStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("loads artifacts and selected detail", async () => {
    vi.mocked(api.listArtifacts).mockResolvedValue({ artifacts: [artifact], total: 1 });
    vi.mocked(api.getArtifact).mockResolvedValue(artifact);

    await useArtifactStore.getState().loadArtifacts();

    expect(api.listArtifacts).toHaveBeenCalledWith({ type: undefined, search: undefined, limit: 100 });
    expect(api.getArtifact).toHaveBeenCalledWith("artifact_1");
    expect(useArtifactStore.getState().selectedArtifact?.content_text).toBe("# Summary");
  });

  it("creates an artifact and selects it", async () => {
    vi.mocked(api.createArtifact).mockResolvedValue(artifact);

    await useArtifactStore.getState().createArtifact({ title: "Run summary", type: "markdown" });

    expect(api.createArtifact).toHaveBeenCalledWith({ title: "Run summary", type: "markdown" });
    expect(useArtifactStore.getState().artifacts[0].id).toBe("artifact_1");
    expect(useArtifactStore.getState().selectedArtifactId).toBe("artifact_1");
  });

  it("archives an artifact out of the active list", async () => {
    useArtifactStore.setState({ artifacts: [artifact], selectedArtifact: artifact, selectedArtifactId: "artifact_1" });
    vi.mocked(api.archiveArtifact).mockResolvedValue({ ...artifact, archived_at: "2026-05-07T00:01:00Z" });

    await useArtifactStore.getState().archiveArtifact("artifact_1");

    expect(api.archiveArtifact).toHaveBeenCalledWith("artifact_1");
    expect(useArtifactStore.getState().artifacts).toEqual([]);
    expect(useArtifactStore.getState().selectedArtifact).toBeNull();
  });

  it("reverts an artifact and keeps it selected", async () => {
    const reverted = { ...artifact, content_text: "# Previous" };
    vi.mocked(api.revertArtifact).mockResolvedValue(reverted);

    await useArtifactStore.getState().revertArtifact("artifact_1", 1);

    expect(api.revertArtifact).toHaveBeenCalledWith("artifact_1", 1);
    expect(useArtifactStore.getState().selectedArtifact?.content_text).toBe("# Previous");
    expect(useArtifactStore.getState().actionMessage).toBe("Artifact reverted to v1");
  });

  it("creates and applies artifact variants", async () => {
    useArtifactStore.setState({ artifacts: [artifact], selectedArtifact: artifact, selectedArtifactId: "artifact_1" });
    vi.mocked(api.createArtifactVariantGroup).mockResolvedValue(variantGroup);
    vi.mocked(api.addArtifactVariant).mockResolvedValue({
      ...variantGroup,
      variants: [
        {
          id: "artifact_variant_1",
          group_id: "artifact_variant_group_1",
          label: "A",
          title: "Variant A",
          file_path: null,
          file_name: null,
          mime_type: "text/markdown",
          size_bytes: null,
          rationale: null,
          score: 90,
          created_at: "2026-05-07T00:00:00Z",
          updated_at: "2026-05-07T00:00:00Z",
          has_content: true,
          content_text: "# Variant",
        },
      ],
    });
    vi.mocked(api.applyArtifactVariant).mockResolvedValue({ ...artifact, content_text: "# Variant" });

    await useArtifactStore.getState().createVariantGroup("artifact_1", { title: "Variants" });
    await useArtifactStore.getState().addVariant("artifact_variant_group_1", { label: "A", content_text: "# Variant" });
    await useArtifactStore.getState().applyVariant("artifact_variant_group_1", "artifact_variant_1");

    expect(api.createArtifactVariantGroup).toHaveBeenCalledWith("artifact_1", { title: "Variants" });
    expect(api.addArtifactVariant).toHaveBeenCalledWith("artifact_variant_group_1", { label: "A", content_text: "# Variant" });
    expect(api.applyArtifactVariant).toHaveBeenCalledWith("artifact_variant_group_1", "artifact_variant_1");
    expect(useArtifactStore.getState().selectedArtifact?.content_text).toBe("# Variant");
    expect(useArtifactStore.getState().actionMessage).toBe("Variant applied");
  });

  it("captures browser evidence and selects the report", async () => {
    const report = { ...artifact, id: "artifact_evidence", type: "report" as const, source: "browser_evidence" };
    vi.mocked(api.runArtifactBrowserEvidence).mockResolvedValue(report);

    await useArtifactStore.getState().runBrowserEvidence("artifact_1");

    expect(api.runArtifactBrowserEvidence).toHaveBeenCalledWith("artifact_1");
    expect(useArtifactStore.getState().selectedArtifactId).toBe("artifact_evidence");
    expect(useArtifactStore.getState().actionMessage).toBe("Browser evidence captured");
  });

  it("sets an error when artifacts are unavailable", async () => {
    vi.mocked(api.listArtifacts).mockRejectedValue(new Error("Adapter auth token is unavailable"));

    await useArtifactStore.getState().loadArtifacts();

    expect(useArtifactStore.getState().error).toBe("Adapter auth token is unavailable");
  });
});
