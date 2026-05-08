import React from "react";
import { useUiStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useRunStore } from "../../stores/runStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useProfileStore } from "../../stores/profileStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useModelStore } from "../../stores/modelStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";

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
  const config = useModelStore((s) => s.config);
  const availableModels = useModelStore((s) => s.availableModels);
  const loadConfig = useModelStore((s) => s.loadConfig);
  const skills = useHermesInventoryStore((s) => s.skills);
  const toolsets = useHermesInventoryStore((s) => s.toolsets);
  const loadInventory = useHermesInventoryStore((s) => s.loadInventory);
  const [prompt, setPrompt] = React.useState("");
  const [workspacePath, setWorkspacePath] = React.useState(selectedWorkspace ?? "");
  const [sessionId, setSessionId] = React.useState(activeSessionId ?? "default");
  const [mode, setMode] = React.useState("chat");
  const [linkedCard, setLinkedCard] = React.useState("");
  const [selectedModel, setSelectedModel] = React.useState("");
  const [selectedProvider, setSelectedProvider] = React.useState("");
  const [selectedSkills, setSelectedSkills] = React.useState<string[]>([]);
  const [selectedToolsets, setSelectedToolsets] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setWorkspacePath(selectedWorkspace ?? "");
    setSessionId(activeSessionId ?? "default");
    loadConfig();
    loadInventory();
  }, [open, selectedWorkspace, activeSessionId, loadConfig, loadInventory]);

  React.useEffect(() => {
    if (!open || !config) return;
    setSelectedModel(config.model);
    setSelectedProvider(config.provider);
  }, [open, config]);

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
    await sendPrompt(text, sessionId || "default", {
      workspacePath: workspace,
      mode,
      model: selectedModel || undefined,
      provider: selectedProvider || undefined,
      skills: selectedSkills.length ? selectedSkills : undefined,
      toolsets: selectedToolsets.length ? selectedToolsets : undefined,
    });
  }

  const providers = [...new Set(availableModels.map((m) => m.provider))];
  const modelsForProvider = selectedProvider
    ? availableModels.filter((m) => m.provider === selectedProvider)
    : availableModels;
  const installedSkills = skills.filter((skill) => skill.installed).slice(0, 14);
  const runToolsets = toolsets
    .filter((toolset) => toolset.platform === "cli" || toolset.kind === "mcp")
    .slice(0, 18);

  function toggleSkill(skillId: string) {
    setSelectedSkills((current) => current.includes(skillId)
      ? current.filter((item) => item !== skillId)
      : [...current, skillId]);
  }

  function toggleToolset(toolsetId: string) {
    setSelectedToolsets((current) => current.includes(toolsetId)
      ? current.filter((item) => item !== toolsetId)
      : [...current, toolsetId]);
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
            <div className="field-help">Forwarded to Hermes as run context and stored in the Studio ledger.</div>

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

            <label className="field-label" htmlFor="new-run-provider">Provider</label>
            <select
              id="new-run-provider"
              className="studio-select"
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                const firstModel = availableModels.find((m) => m.provider === e.target.value);
                setSelectedModel(firstModel?.id ?? "");
              }}
            >
              <option value="">{config?.provider ?? "Select provider"}</option>
              {providers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <label className="field-label" htmlFor="new-run-model">Model</label>
            <select
              id="new-run-model"
              className="studio-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="">{config?.model ?? "Select model"}</option>
              {modelsForProvider.map((m) => (
                <option key={`${m.provider}:${m.id}`} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
            <div className="field-help">
              {availableModels.length.toLocaleString()} local Hermes model{availableModels.length !== 1 ? "s" : ""} detected.
            </div>

            {installedSkills.length > 0 && (
              <>
                <label className="field-label">Preload skills</label>
                <div className="selector-chip-grid">
                  {installedSkills.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      className={`selector-chip ${selectedSkills.includes(skill.id) ? "active" : ""}`}
                      onClick={() => toggleSkill(skill.id)}
                      title={skill.description || skill.title}
                    >
                      {skill.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {runToolsets.length > 0 && (
              <>
                <label className="field-label">Toolsets</label>
                <div className="selector-chip-grid">
                  {runToolsets.map((toolset) => (
                    <button
                      key={`${toolset.platform}:${toolset.id}`}
                      type="button"
                      className={`selector-chip ${selectedToolsets.includes(toolset.id) ? "active" : ""}`}
                      onClick={() => toggleToolset(toolset.id)}
                    >
                      {toolset.id}
                    </button>
                  ))}
                </div>
              </>
            )}

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
