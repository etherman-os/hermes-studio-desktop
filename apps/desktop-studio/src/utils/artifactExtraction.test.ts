import { describe, expect, it } from "vitest";
import type { StudioEvent } from "../api/studioClient";
import { extractRunArtifactCandidates } from "./artifactExtraction";

function event(type: StudioEvent["type"], text: string): StudioEvent {
  return {
    id: `${type}-1`,
    type,
    run_id: "run-1",
    session_id: "session-1",
    timestamp: "2026-05-09T00:00:00Z",
    source: "hermes",
    payload: type === "assistant.delta" ? { text } : { output: text },
  };
}

describe("artifactExtraction", () => {
  it("extracts typed artifacts from assistant fenced output", () => {
    const candidates = extractRunArtifactCandidates({
      runId: "run-1",
      sessionId: "session-1",
      prompt: "build artifact previews",
      events: [
        event("assistant.delta", [
          "Here is the page:",
          "```html index.html",
          "<!doctype html><html><body><button>Launch</button></body></html>",
          "```",
          "And config:",
          "```json",
          "{\"enabled\":true}",
          "```",
        ].join("\n")),
      ],
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      title: "Run output · index.html",
      type: "html",
      mime_type: "text/html",
      run_id: "run-1",
      session_id: "session-1",
      source: "run_output",
    });
    expect(candidates[1]).toMatchObject({
      type: "json",
      mime_type: "application/json",
    });
  });

  it("deduplicates identical blocks and detects filenames from comments", () => {
    const block = [
      "```tsx",
      "// file: src/App.tsx",
      "export function App() { return <main />; }",
      "```",
    ].join("\n");
    const candidates = extractRunArtifactCandidates({
      runId: "run-1",
      sessionId: null,
      prompt: "make app",
      events: [event("assistant.delta", `${block}\n${block}`)],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe("Run output · App.tsx");
    expect(candidates[0].type).toBe("text");
  });

  it("extracts whole-output HTML when no code fence exists", () => {
    const candidates = extractRunArtifactCandidates({
      runId: "run-1",
      sessionId: null,
      prompt: "single html",
      events: [event("assistant.delta", "<html><body><h1>Ready</h1></body></html>")],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe("html");
  });

  it("reads tool output fields too", () => {
    const candidates = extractRunArtifactCandidates({
      runId: "run-1",
      sessionId: null,
      prompt: "tool wrote report",
      events: [
        {
          ...event("tool.completed", "```markdown\n# Report\n\nDone.\n```"),
          payload: { stdout: "```markdown\n# Report\n\nDone.\n```" },
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe("markdown");
  });
});
