import React from "react";
import { useUiStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useRunStore } from "../../stores/runStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useProfileStore } from "../../stores/profileStore";
import { useLayoutStore } from "../../stores/layoutStore";
import * as api from "../../api/studioClient";

export function NewRunModal() {
  const open = useUiStore((s) => s.newRunOpen);
  const close = useUiStore((s) => s.closeNewRun);
  const openWorkspacePicker = useUiStore((s) => s.openWorkspacePicker);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace);
  const sendPrompt = useRunStore((s) => s.sendPrompt);
  const newChat = useRunStore((s) => s.newChat);
  const isStreaming = useRunStore((s) => s.isStreaming);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const [prompt, setPrompt] = React.useState("");
  const [workspacePath, setWorkspacePath] = React.useState(selectedWorkspace ?? "");
  const [sessionId, setSessionId] = React.useState(activeSessionId ?? "default");
  const [mode, setMode] = React.useState("chat");
  const [linkedCard, setLinkedCard] = React.useState("");
  const [model, setModel] = React.useState<api.ModelConfig | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setWorkspacePath(selectedWorkspace ?? "");
    setSessionId(activeSessionId ?? "default");
    api.getModelConfig().then(setModel).catch(() => setModel(null));
  }, [open, selectedWorkspace, activeSessionId]);

  React.useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  if (!open) return null;

  async function submit() {
    const text = prompt.trim();
    if (!text) return;
    const workspace = workspacePath.trim() || null;
    if (workspace) selectWorkspace(workspace);
    newChat();
    close();
    setActiveTab("chat");
    setPrompt("");
    await sendPrompt(text, sessionId || "default", { workspacePath: workspace, mode });
  }

  return (
    <div className="modal-backdrop" onClick={close} role="dialog" aria-modal="true" aria-label="New run">
      <div className="studio-modal new-run-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="workbench-eyebrow">New Run</div>
            <h2 id="new-run-title">Start Hermes work in a local workspace</h2>
          </div>
          <button className="icon-button" onClick={close} title="Close" aria-label="Close dialog">x</button>
        </div>

        <div className="modal-body new-run-grid">
          <div className="new-run-main">
            <label className="field-label" htmlFor="new-run-prompt">Prompt</label>
            <textarea
              id="new-run-prompt"
              className="studio-textarea"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask Hermes to inspect, debug, review, or implement something..."
              autoFocus
            />
          </div>

          <div className="new-run-side">
            <label className="field-label" htmlFor="new-run-workspace">Workspace path</label>
            <div className="inline-field">
              <input
                id="new-run-workspace"
                className="studio-input"
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder="/home/user/project"
              />
              <button className="tool-button" onClick={openWorkspacePicker}>Select</button>
            </div>
            <div className="field-help">Stored as Studio run metadata. Hermes cwd forwarding waits for verified runtime support.</div>

            <label className="field-label" htmlFor="new-run-mode">Run mode</label>
            <select id="new-run-mode" className="studio-select" value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="chat">Chat</option>
              <option value="task">Task</option>
              <option value="review">Review</option>
              <option value="debug">Debug</option>
            </select>

            <label className="field-label" htmlFor="new-run-session">Session</label>
            <select id="new-run-session" className="studio-select" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
              <option value="default">Default session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>{session.title}</option>
              ))}
            </select>

            <label className="field-label">Profile</label>
            <div className="readonly-field">{activeProfile?.name ?? "unknown"}</div>

            <label className="field-label">Model/provider</label>
            <div className="readonly-field">{model ? `${model.provider} / ${model.model}` : "unavailable"}</div>

            <label className="field-label" htmlFor="new-run-card">Linked Kanban card</label>
            <input
              id="new-run-card"
              className="studio-input"
              value={linkedCard}
              onChange={(event) => setLinkedCard(event.target.value)}
              placeholder="Optional card id"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="tool-button" onClick={close}>Cancel</button>
          <button className="primary-button" onClick={() => void submit()} disabled={!prompt.trim() || isStreaming}>
            {isStreaming ? "Run in progress" : "Start Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
