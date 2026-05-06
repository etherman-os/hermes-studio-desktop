import { useThemeStore } from "../../stores/themeStore";
import { useRunStore } from "../../stores/runStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useAdapterStore } from "../../stores/adapterStore";
import React from "react";

export function ChatSurface() {
  const label = useThemeStore((s) => s.label);
  const isStreaming = useRunStore((s) => s.isStreaming);
  const messages = useRunStore((s) => s.messages);
  const sendPrompt = useRunStore((s) => s.sendPrompt);
  const stopRun = useRunStore((s) => s.stopRun);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const connected = useAdapterStore((s) => s.connected);
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
      sendPrompt(text, activeSessionId ?? "s-1");
    } else {
      // Fallback: show user message locally with adapter warning
      useRunStore.getState().appendUserMessage(text);
      useRunStore.getState().appendAssistantChunk("[Adapter disconnected — message saved locally. Start the adapter to send to Hermes.]");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-container">
      <div className="chat-messages selectable">
        {messages.map((msg, i) => {
          if (msg.role === "tool") {
            return (
              <div key={i} style={{ display: "flex", gap: "var(--app-spacing-sm)", alignItems: "center" }}>
                <span className={`tool-chip ${msg.toolStatus === "completed" ? "completed" : msg.toolStatus === "running" ? "running" : ""}`}>
                  {msg.toolStatus === "completed" ? "✓" : msg.toolStatus === "running" ? "⏳" : "✕"} {msg.toolName}
                  {msg.toolDuration ? ` (${(msg.toolDuration / 1000).toFixed(1)}s)` : ""}
                </span>
              </div>
            );
          }
          return (
            <div key={i} className={`chat-message ${msg.role}`}>
              <div className="chat-message-role">{msg.role}</div>
              <div className="chat-message-content">{msg.content}</div>
            </div>
          );
        })}
        {isStreaming && (
          <div className="chat-message assistant">
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
        <input
          className="composer-input"
          placeholder={connected ? `${label("composer")}...` : `${label("composer")} (adapter offline — messages saved locally)`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={!connected ? { borderColor: "var(--app-warn)" } : undefined}
        />
        {isStreaming ? (
          <button className="composer-send" onClick={stopRun} style={{ background: "var(--app-danger)" }}>
            {label("stop")}
          </button>
        ) : (
          <button className="composer-send" onClick={handleSend}>
            {label("send")}
          </button>
        )}
      </div>
    </div>
  );
}
