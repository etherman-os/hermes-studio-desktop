import { beforeEach, describe, expect, it } from "vitest";
import { useRunLedgerStore } from "./runLedgerStore";
import type { StudioEvent } from "../api/studioClient";

function resetStore() {
  useRunLedgerStore.setState({
    runs: [],
    currentRunId: null,
    selectedEventId: null,
  });
}

function event(type: StudioEvent["type"], payload: Record<string, unknown> = {}): StudioEvent {
  return {
    id: `${type}-1`,
    type,
    run_id: "run-1",
    session_id: "session-1",
    timestamp: "2026-05-07T00:00:00Z",
    source: "hermes",
    payload,
  };
}

describe("runLedgerStore", () => {
  beforeEach(() => resetStore());

  it("starts a run with a synthetic run.started event", () => {
    useRunLedgerStore.getState().startRun("run-1", "check repo", "session-1", "started");

    const run = useRunLedgerStore.getState().runs[0];

    expect(run.runId).toBe("run-1");
    expect(run.status).toBe("running");
    expect(run.events[0].type).toBe("run.started");
  });

  it("records stream events and completes the selected run", () => {
    useRunLedgerStore.getState().startRun("run-1", "check repo", "session-1", "started");
    useRunLedgerStore.getState().recordEvent(event("assistant.delta", { text: "Done" }));
    useRunLedgerStore.getState().recordEvent(event("run.completed", { run_id: "run-1" }));

    const run = useRunLedgerStore.getState().runs[0];

    expect(run.events.map((item) => item.type)).toContain("assistant.delta");
    expect(run.status).toBe("completed");
  });

  it("stores local adapter warnings when no run exists", () => {
    useRunLedgerStore.getState().recordLocalWarning("Adapter offline");

    const run = useRunLedgerStore.getState().runs[0];

    expect(run.status).toBe("idle");
    expect(run.events[0].type).toBe("adapter.warning");
  });
});
