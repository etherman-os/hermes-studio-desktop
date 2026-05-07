import React from "react";
import { useThemeStore } from "../../stores/themeStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useRunLedgerStore, type RunRecord } from "../../stores/runLedgerStore";
import { ApprovalCenter } from "../approvals/ApprovalCenter";
import { mockMemory } from "../../fixtures/mockData";
import * as api from "../../api/studioClient";

export function RightPanel() {
  const label = useThemeStore((s) => s.label);
  const icon = useThemeStore((s) => s.icon);
  const connected = useAdapterStore((s) => s.connected);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const hermesConnected = useAdapterStore((s) => s.hermesConnected);
  const fallbackReason = useAdapterStore((s) => s.fallbackReason);
  const authError = useAdapterStore((s) => s.authError);
  const runs = useRunLedgerStore((s) => s.runs);
  const currentRunId = useRunLedgerStore((s) => s.currentRunId);
  const run = runs.find((item) => item.runId === currentRunId) ?? runs[0] ?? null;

  return (
    <div className="right-panel">
      <SelectedRunSection run={run} label={label} />
      <ModelSection connected={connected} backendMode={backendMode} label={label} icon={icon} />
      <ToolsSection run={run} />
      <div className="right-section">
        <div className="right-section-title">{label("approvals")}</div>
        <ApprovalCenter />
      </div>
      <div className="right-section">
        <div className="right-section-title">{label("memory")} {icon("memory")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--app-spacing-xs)" }}>
          {mockMemory.map((m) => (
            <div key={m.key} style={{ fontSize: "var(--app-font-size-sm)" }}>
              <span style={{ color: "var(--app-text-muted)" }}>{m.key}:</span>{" "}
              <span style={{ color: "var(--app-text-secondary)" }}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>
      <ContextSection />
      <DiagnosticsSection
        connected={connected}
        backendMode={backendMode}
        hermesConnected={hermesConnected}
        authError={authError}
        fallbackReason={fallbackReason}
      />
    </div>
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

function ContextSection() {
  return (
    <div className="right-section">
      <div className="right-section-title">Context</div>
      <div className="inspector-list">
        <div className="inspector-row"><span>SOUL.md</span><span>not indexed</span></div>
        <div className="inspector-row"><span>AGENTS.md</span><span>not indexed</span></div>
        <div className="inspector-row"><span>@ references</span><span>future</span></div>
      </div>
    </div>
  );
}

function DiagnosticsSection({
  connected,
  backendMode,
  hermesConnected,
  authError,
  fallbackReason,
}: {
  connected: boolean;
  backendMode: string;
  hermesConnected: boolean;
  authError: string | null;
  fallbackReason: string | null;
}) {
  return (
    <div className="right-section">
      <div className="right-section-title">Diagnostics</div>
      <dl className="right-panel-info">
        <dt>Adapter</dt>
        <dd>{connected ? "connected" : "disconnected"}</dd>
        <dt>Backend</dt>
        <dd>{backendMode}</dd>
        <dt>Hermes</dt>
        <dd>{hermesConnected ? "reachable" : "not reachable"}</dd>
        {(authError || fallbackReason) && (
          <>
            <dt>Notice</dt>
            <dd>{authError ?? fallbackReason}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function ModelSection({ connected, backendMode, label, icon }: { connected: boolean; backendMode: string; label: (s: string) => string; icon: (s: string) => string }) {
  const [config, setConfig] = React.useState<api.ModelConfig | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadConfig = React.useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getModelConfig();
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, [connected]);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return (
    <div className="right-section">
      <div className="right-section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{icon("inspector")} Model</span>
        <button
          onClick={loadConfig}
          disabled={loading || !connected}
          style={{ background: "transparent", border: "none", color: "var(--app-text-muted)", cursor: "pointer", fontSize: "11px", padding: "0 4px" }}
          title="Refresh model config"
        >
          ↻
        </button>
      </div>

      {!connected && (
        <div style={{ fontSize: "var(--app-font-size-sm)", color: "var(--app-text-muted)", fontStyle: "italic" }}>
          Adapter disconnected
        </div>
      )}

      {connected && loading && (
        <div style={{ fontSize: "var(--app-font-size-sm)", color: "var(--app-text-muted)" }}>Loading...</div>
      )}

      {connected && error && (
        <div style={{ fontSize: "var(--app-font-size-sm)", color: "var(--app-danger)" }}>{error}</div>
      )}

      {connected && config && !loading && (
        <dl className="right-panel-info">
          <dt>Provider</dt>
          <dd>{config.provider}</dd>
          <dt>Model</dt>
          <dd>{config.model}</dd>
          {config.base_url && (
            <>
              <dt>Base URL</dt>
              <dd>{config.base_url}</dd>
            </>
          )}
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
          {config.available_model_count != null && config.available_model_count > 0 && (
            <>
              <dt>Models</dt>
              <dd>{config.available_model_count} available</dd>
            </>
          )}
          <dt>Config Source</dt>
          <dd>{config.config_source}</dd>
          <dt>Backend</dt>
          <dd>{backendMode}</dd>
        </dl>
      )}

      {connected && config?.warnings && config.warnings.length > 0 && (
        <div style={{ marginTop: "var(--app-spacing-xs)" }}>
          {config.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: "10px", color: "var(--app-warn)" }}>⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
