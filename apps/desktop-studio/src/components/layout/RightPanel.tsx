import React from "react";
import { useThemeStore } from "../../stores/themeStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useRunLedgerStore, type RunRecord } from "../../stores/runLedgerStore";
import { useModelStore } from "../../stores/modelStore";
import { RuntimeStatus } from "../runtime/RuntimeStatus";
import { LoadingSkeleton } from "../Skeleton";

export function RightPanel() {
  const label = useThemeStore((s) => s.label);
  const icon = useThemeStore((s) => s.icon);
  const connected = useAdapterStore((s) => s.connected);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const runs = useRunLedgerStore((s) => s.runs);
  const currentRunId = useRunLedgerStore((s) => s.currentRunId);
  const run = runs.find((item) => item.runId === currentRunId) ?? runs[0] ?? null;

  return (
    <aside className="right-panel" role="complementary" aria-label="Inspector panel">
      <SelectedRunSection run={run} label={label} />
      <ModelSection connected={connected} backendMode={backendMode} label={label} icon={icon} />
      <ToolsSection run={run} />
      <div className="right-section runtime-right-section">
        <RuntimeStatus compact />
      </div>
    </aside>
  );
}

function SelectedRunSection({ run, label }: { run: RunRecord | null; label: (s: string) => string }) {
  return (
    <div className="right-section">
      <div className="right-section-title">{label("inspector")} · Selected Run</div>
      {run ? (
        <dl className="right-panel-info">
          <dt>Run</dt>
          <dd>{run.runId}</dd>
          <dt>Status</dt>
          <dd>{run.status}</dd>
          <dt>Prompt</dt>
          <dd>{run.prompt || "local event"}</dd>
          <dt>Events</dt>
          <dd>{run.events.length}</dd>
          <dt>Workspace</dt>
          <dd>{run.workspacePath ?? "not selected"}</dd>
        </dl>
      ) : (
        <div className="panel-note">No run selected</div>
      )}
    </div>
  );
}

function ToolsSection({ run }: { run: RunRecord | null }) {
  const tools = (run?.events ?? [])
    .filter((event) => event.type === "tool.started" || event.type === "tool.progress" || event.type === "tool.completed")
    .slice(-6)
    .reverse();

  return (
    <div className="right-section">
      <div className="right-section-title">Tools</div>
      {tools.length === 0 ? (
        <div className="panel-note">No tool events for the selected run</div>
      ) : (
        <div className="inspector-list">
          {tools.map((event) => (
            <div key={event.id} className="inspector-row">
              <span>{event.type.replace("tool.", "")}</span>
              <span>{String(event.payload.tool ?? "tool")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelSection({ connected, backendMode, label, icon }: { connected: boolean; backendMode: string; label: (s: string) => string; icon: (s: string) => string }) {
  const config = useModelStore((s) => s.config);
  const availableModels = useModelStore((s) => s.availableModels);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const selectedProvider = useModelStore((s) => s.selectedProvider);
  const loading = useModelStore((s) => s.loading);
  const saving = useModelStore((s) => s.saving);
  const error = useModelStore((s) => s.error);
  const loadConfig = useModelStore((s) => s.loadConfig);
  const selectModel = useModelStore((s) => s.selectModel);
  const selectProvider = useModelStore((s) => s.selectProvider);
  const applySelection = useModelStore((s) => s.applySelection);

  React.useEffect(() => {
    if (connected) loadConfig();
  }, [connected, loadConfig]);

  const providers = [...new Set(availableModels.map((m) => m.provider))];
  const modelsForProvider = selectedProvider
    ? availableModels.filter((m) => m.provider === selectedProvider)
    : availableModels;

  const hasChanges = (selectedModel && selectedModel !== config?.model) ||
    (selectedProvider && selectedProvider !== config?.provider);

  return (
    <div className="right-section">
      <div className="right-section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{icon("inspector")} Model</span>
        <button
          onClick={() => loadConfig()}
          disabled={loading || !connected}
          style={{ background: "transparent", border: "none", color: "var(--app-text-muted)", cursor: "pointer", fontSize: "11px", padding: "0 4px" }}
          title="Refresh model config"
        >
          {loading ? "..." : "↻"}
        </button>
      </div>

      {!connected && (
        <div style={{ fontSize: "var(--app-font-size-sm)", color: "var(--app-text-muted)", fontStyle: "italic" }}>
          Adapter disconnected
        </div>
      )}

      {connected && loading && <LoadingSkeleton lines={3} />}

      {connected && error && (
        <div style={{ fontSize: "var(--app-font-size-sm)", color: "var(--app-danger)" }}>{error}</div>
      )}

      {connected && config && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--app-spacing-xs)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <label
              htmlFor="model-provider-select"
              style={{ fontSize: "10px", color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              Provider
            </label>
            <select
              id="model-provider-select"
              value={selectedProvider ?? config.provider}
              onChange={(e) => {
                selectProvider(e.target.value);
                const firstModel = availableModels.find((m) => m.provider === e.target.value);
                selectModel(firstModel?.id ?? "");
              }}
              style={{
                background: "var(--app-surface)",
                color: "var(--app-text)",
                border: "1px solid var(--app-border)",
                borderRadius: "var(--app-radius-sm)",
                padding: "4px 6px",
                fontSize: "var(--app-font-size-sm)",
              }}
            >
              <option value={config.provider}>{config.provider}</option>
              {providers.filter((p) => p !== config.provider).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <label
              htmlFor="model-select"
              style={{ fontSize: "10px", color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              Model
            </label>
            <select
              id="model-select"
              value={selectedModel ?? config.model}
              onChange={(e) => selectModel(e.target.value)}
              style={{
                background: "var(--app-surface)",
                color: "var(--app-text)",
                border: "1px solid var(--app-border)",
                borderRadius: "var(--app-radius-sm)",
                padding: "4px 6px",
                fontSize: "var(--app-font-size-sm)",
              }}
            >
              <option value={config.model}>{config.model}</option>
              {modelsForProvider.filter((m) => m.id !== config.model).map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
          </div>

          {hasChanges && (
            <button
              onClick={() => void applySelection()}
              disabled={saving}
              style={{
                background: "var(--app-accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--app-radius-sm)",
                padding: "4px 8px",
                fontSize: "var(--app-font-size-sm)",
                cursor: saving ? "default" : "pointer",
                marginTop: "var(--app-spacing-xs)",
              }}
            >
              {saving ? "Applying..." : "Apply Model Change"}
            </button>
          )}

          <dl className="right-panel-info" style={{ marginTop: "var(--app-spacing-xs)" }}>
            <dt>API Key</dt>
            <dd>{config.api_key_configured ? `Yes (${config.api_key_source ?? "configured"})` : "Not configured"}</dd>
            {config.temperature != null && (
              <>
                <dt>Temperature</dt>
                <dd>{config.temperature}</dd>
              </>
            )}
            {config.context_window != null && (
              <>
                <dt>Context</dt>
                <dd>{config.context_window.toLocaleString()}</dd>
              </>
            )}
            <dt>Backend</dt>
            <dd>{backendMode === "mock" ? "Studio" : backendMode}</dd>
          </dl>
        </div>
      )}

      {connected && config?.warnings && config.warnings.length > 0 && (
        <div style={{ marginTop: "var(--app-spacing-xs)" }}>
          {config.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: "10px", color: "var(--app-warn)" }}>Warning: {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
