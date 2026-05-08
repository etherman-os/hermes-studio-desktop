import React from "react";
import * as api from "../../api/studioClient";
import { useAdapterStore } from "../../stores/adapterStore";
import { useProfileStore } from "../../stores/profileStore";

interface RuntimeStatusProps {
  compact?: boolean;
}

export function RuntimeStatus({ compact = false }: RuntimeStatusProps) {
  const connected = useAdapterStore((s) => s.connected);
  const checking = useAdapterStore((s) => s.checking);
  const authReady = useAdapterStore((s) => s.authReady);
  const authError = useAdapterStore((s) => s.authError);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const activeBackend = useAdapterStore((s) => s.activeBackend);
  const hermesConnected = useAdapterStore((s) => s.hermesConnected);
  const hermesUrl = useAdapterStore((s) => s.hermesUrl);
  const storageAvailable = useAdapterStore((s) => s.storageAvailable);
  const storageError = useAdapterStore((s) => s.storageError);
  const storageSchemaVersion = useAdapterStore((s) => s.storageSchemaVersion);
  const fallbackReason = useAdapterStore((s) => s.fallbackReason);
  const lastCheckedAt = useAdapterStore((s) => s.lastCheckedAt);
  const refresh = useAdapterStore((s) => s.checkConnection);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const [model, setModel] = React.useState<api.ModelConfig | null>(null);
  const [modelError, setModelError] = React.useState<string | null>(null);

  const loadModel = React.useCallback(async () => {
    if (!connected || !authReady) return;
    try {
      const data = await api.getModelConfig();
      setModel(data);
      setModelError(null);
    } catch (err) {
      setModel(null);
      setModelError(err instanceof Error ? err.message : "Model config unavailable");
    }
  }, [connected, authReady]);

  React.useEffect(() => {
    void loadModel();
  }, [loadModel]);

  const resolvedBackend = backendMode === "auto" ? activeBackend : backendMode;
  const mockActive = resolvedBackend === "mock";
  const hermesActive = resolvedBackend === "hermes";

  return (
    <div className={compact ? "runtime-status compact" : "runtime-status"}>
      <div className="runtime-status-header">
        <div>
          <div className="workbench-eyebrow">Runtime</div>
          <div className="runtime-title">
            {mockActive && "Studio simulation backend"}
            {hermesActive && hermesConnected && "Connected to Hermes"}
            {hermesActive && !hermesConnected && "Hermes unreachable"}
            {!mockActive && !hermesActive && "Runtime status"}
          </div>
        </div>
        <button className="tool-button" onClick={() => void refresh()} disabled={checking}>
          {checking ? "Refreshing" : "Refresh runtime status"}
        </button>
      </div>

      {mockActive && (
        <div className="runtime-warning">
          Studio simulation is active. Local Hermes inventory is still read from this machine; live runs switch to Hermes when Auto resolves the Hermes gateway.
        </div>
      )}
      {fallbackReason && (
        <div className="runtime-warning">Auto mode fallback: {fallbackReason}</div>
      )}

      <dl className="runtime-grid">
        <dt>Adapter</dt>
        <dd>{connected ? "Connected" : "Disconnected"}</dd>
        <dt>Auth</dt>
        <dd>{authReady ? "Ready" : authError ? "Missing token" : "Not ready"}</dd>
        <dt>Backend mode</dt>
        <dd>{backendMode}{backendMode === "auto" ? ` -> ${activeBackend}` : ""}</dd>
        <dt>Hermes API</dt>
        <dd>{hermesConnected ? "Reachable" : "Unreachable"}</dd>
        <dt>Hermes URL</dt>
        <dd>{hermesUrl}</dd>
        <dt>Active profile</dt>
        <dd>{activeProfile?.name ?? "unknown"}</dd>
        <dt>Model/provider</dt>
        <dd>{model ? `${model.provider} / ${model.model}` : modelError ?? "unknown"}</dd>
        <dt>Storage</dt>
        <dd>{storageAvailable ? `Ready (schema ${storageSchemaVersion})` : `Error${storageError ? `: ${storageError}` : ""}`}</dd>
        {lastCheckedAt && (
          <>
            <dt>Checked</dt>
            <dd>{new Date(lastCheckedAt).toLocaleTimeString()}</dd>
          </>
        )}
      </dl>

      {!compact && (
        <div className="runtime-instructions">
          <div className="runtime-instructions-title">Run real Hermes locally</div>
          <pre>{`API_SERVER_ENABLED=true hermes gateway --accept-hooks run
HERMES_STUDIO_BACKEND=hermes HERMES_API_BASE_URL=http://127.0.0.1:8642 pnpm run dev:adapter
pnpm run tauri dev`}</pre>
        </div>
      )}
    </div>
  );
}
