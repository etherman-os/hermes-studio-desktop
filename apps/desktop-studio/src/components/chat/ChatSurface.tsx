import { useThemeStore } from "../../stores/themeStore";
import { useRunStore } from "../../stores/runStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useUiStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import React from "react";

export function ChatSurface() {
  const label = useThemeStore((s) => s.label);
  const isStreaming = useRunStore((s) => s.isStreaming);
  const messages = useRunStore((s) => s.messages);
  const sendPrompt = useRunStore((s) => s.sendPrompt);
  const stopRun = useRunStore((s) => s.stopRun);
  const activeRunId = useRunStore((s) => s.activeRunId);
  const lastRunId = useRunStore((s) => s.lastRunId);
  const runs = useRunLedgerStore((s) => s.runs);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const selectLedgerRun = useRunLedgerStore((s) => s.selectRun);
  const createCardFromRun = useRunLedgerStore((s) => s.createCardFromRun);
  const savingRunCard = useRunLedgerStore((s) => s.savingRunCard);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const connected = useAdapterStore((s) => s.connected);
  const activeBackend = useAdapterStore((s) => s.activeBackend);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const openNewRun = useUiStore((s) => s.openNewRun);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const [input, setInput] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (connected) {
      sendPrompt(text, activeSessionId ?? "s-1", { workspacePath: selectedWorkspace, mode: "chat" });
    } else {
      // Fallback: show user message locally with adapter warning
      useRunStore.getState().appendUserMessage(text);
      useRunStore.getState().appendAssistantChunk("[Adapter disconnected — message saved locally. Start the adapter to send to Hermes.]");
      useRunLedgerStore.getState().recordLocalWarning("Adapter disconnected; prompt was not sent to Hermes", null, activeSessionId);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const ledgerRun = runs.find((run) => run.runId === activeRunId) ?? runs.find((run) => run.runId === lastRunId) ?? runs[0];
  const toolEvents = ledgerRun?.events.filter((event) => event.type === "tool.started" || event.type === "tool.completed").slice(-4) ?? [];
  const mockActive = backendMode === "mock" || activeBackend === "mock";

  function openLedger() {
    if (ledgerRun) selectLedgerRun(ledgerRun.runId);
    setActiveTab("runs");
  }

  return (
    <div className="chat-container" role="region" aria-label="Chat">
      <div className="chat-run-strip">
        <div>
          <div className="workbench-eyebrow">Chat Surface</div>
          <div className="chat-run-meta">
            <span>Run {ledgerRun?.runId ?? "none"}</span>
            <span>Status {ledgerRun?.status ?? (isStreaming ? "running" : "idle")}</span>
            <span>Session {activeSessionId ?? "none"}</span>
            <span>Workspace {selectedWorkspace ?? "none"}</span>
            {mockActive && <span className="runtime-chip warn">Mock data</span>}
          </div>
        </div>
        <div className="chat-run-actions">
          <button className="tool-button" onClick={openNewRun} aria-label="Start new chat">New Chat</button>
          <button className="tool-button" onClick={openLedger} aria-label="Open run in ledger">Open in Run Ledger</button>
          <button
            className="tool-button"
            disabled={!ledgerRun || savingRunCard}
            onClick={() => ledgerRun && void createCardFromRun(ledgerRun.runId)}
            aria-label="Create kanban card from run"
          >
            Create Card from Run
          </button>
        </div>
      </div>
      {toolEvents.length > 0 && (
        <div className="chat-tool-strip" role="status" aria-label="Active tools">
          {toolEvents.map((event) => (
            <span key={event.id} className={`tool-chip ${event.type === "tool.completed" ? "completed" : "running"}`}>
              {String(event.payload.tool ?? "tool")}
            </span>
          ))}
        </div>
      )}
      <div className="chat-messages selectable" role="log" aria-label="Chat messages" aria-live="polite">
        {messages.map((msg) => {
          if (msg.role === "tool") {
            return (
              <div key={msg.id} style={{ display: "flex", gap: "var(--app-spacing-sm)", alignItems: "center" }}>
                <span className={`tool-chip ${msg.toolStatus === "completed" ? "completed" : msg.toolStatus === "running" ? "running" : ""}`}>
                  {msg.toolStatus === "completed" ? "✓" : msg.toolStatus === "running" ? "⏳" : "✕"} {msg.toolName}
                  {msg.toolDuration ? ` (${(msg.toolDuration / 1000).toFixed(1)}s)` : ""}
                </span>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`chat-message ${msg.role}`} role="article" aria-label={`${msg.role} message`}>
              <div className="chat-message-role">{msg.role}</div>
              <div className="chat-message-content">{msg.content}</div>
            </div>
          );
        })}
        {isStreaming && (
          <div className="chat-message assistant" role="status" aria-label="Assistant is typing">
            <div className="typing-indicator">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="composer-bar">
        <label htmlFor="composer-input" className="sr-only">Message input</label>
        <input
          id="composer-input"
          className="composer-input"
          placeholder={connected ? `${label("composer")} in ${selectedWorkspace ?? "no workspace"}...` : `${label("composer")} (adapter offline - messages saved locally)`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={!connected ? { borderColor: "var(--app-warn)" } : undefined}
          aria-label="Type a message"
        />
        {isStreaming ? (
          <button className="composer-send" onClick={stopRun} style={{ background: "var(--app-danger)" }} aria-label="Stop run">
            {label("stop")}
          </button>
        ) : (
          <button className="composer-send" onClick={handleSend} aria-label="Send message">
            {label("send")}
          </button>
        )}
      </div>
    </div>
  );
}
