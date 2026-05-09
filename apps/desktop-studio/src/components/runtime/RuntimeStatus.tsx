import React from "react";
import * as api from "../../api/studioClient";
import { useAdapterStore } from "../../stores/adapterStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
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
  const doctorStatus = useHermesInventoryStore((s) => s.doctorStatus);
  const browserCacheStatus = useHermesInventoryStore((s) => s.browserCacheStatus);
  const releaseStatus = useHermesInventoryStore((s) => s.releaseStatus);
  const releaseLoading = useHermesInventoryStore((s) => s.releaseLoading);
  const loadLocalHermesStatus = useHermesInventoryStore((s) => s.loadLocalHermesStatus);
  const checkHermesRelease = useHermesInventoryStore((s) => s.checkHermesRelease);
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

  React.useEffect(() => {
    if (compact || !connected || !authReady) return;
    void loadLocalHermesStatus({ includeDoctor: true });
  }, [authReady, compact, connected, loadLocalHermesStatus]);

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
        {!compact && releaseStatus && (
          <>
            <dt>Hermes version</dt>
            <dd>
              {releaseStatus.version ?? "unknown"}
              {releaseStatus.update_available ? ` · ${releaseStatus.behind_count ?? "?"} behind` : releaseStatus.up_to_date ? " · up to date" : ""}
            </dd>
          </>
        )}
        {!compact && doctorStatus && (
          <>
            <dt>Doctor</dt>
            <dd>
              {doctorStatus.ok_count ?? 0} ok · {doctorStatus.warning_count ?? 0} warnings · {doctorStatus.error_count ?? 0} errors
            </dd>
          </>
        )}
        <dt>Storage</dt>
        <dd>{storageAvailable ? `Ready (schema ${storageSchemaVersion})` : `Error${storageError ? `: ${storageError}` : ""}`}</dd>
        {!compact && browserCacheStatus && (
          <>
            <dt>Playwright</dt>
            <dd>{browserCacheStatus.playwright_chromium_installed ? "Chromium cached" : "Chromium missing"}</dd>
            <dt>Puppeteer</dt>
            <dd>{browserCacheStatus.puppeteer_chrome_installed ? "Chrome cached" : "separate Chrome cache missing"}</dd>
          </>
        )}
        {lastCheckedAt && (
          <>
            <dt>Checked</dt>
            <dd>{new Date(lastCheckedAt).toLocaleTimeString()}</dd>
          </>
        )}
      </dl>

      {!compact && (
        <div className="runtime-instructions">
          <div className="runtime-instructions-title">Hermes Doctor</div>
          <div className="runtime-doctor-summary">
            <button className="tool-button" type="button" onClick={() => void loadLocalHermesStatus({ includeDoctor: true })}>
              Run doctor
            </button>
            {doctorStatus ? (
              <span>{doctorStatus.available ? "Doctor completed" : doctorStatus.error ?? "Doctor unavailable"}</span>
            ) : (
              <span>Run Hermes doctor to inspect provider, tool, browser, and setup health.</span>
            )}
          </div>
          <div className="runtime-doctor-summary">
            <button className="tool-button" type="button" disabled={releaseLoading} onClick={() => void checkHermesRelease()}>
              {releaseLoading ? "Checking" : "Check update"}
            </button>
            {releaseStatus ? (
              <span>
                {releaseStatus.update_available
                  ? `Update available${releaseStatus.behind_count ? `: ${releaseStatus.behind_count} commits behind` : ""}`
                  : releaseStatus.up_to_date ? "Hermes is up to date" : releaseStatus.error ?? "Update status checked"}
              </span>
            ) : (
              <span>Check Hermes release status without installing updates.</span>
            )}
          </div>
          {browserCacheStatus && (
            <div className="runtime-cache-note">
              <strong>Browser caches</strong>
              <span>{browserCacheStatus.note}</span>
              <code>{browserCacheStatus.playwright_cache_dir}</code>
              <code>{browserCacheStatus.puppeteer_cache_dir}</code>
            </div>
          )}
          {doctorStatus?.checks && doctorStatus.checks.length > 0 && (
            <div className="runtime-doctor-list">
              {doctorStatus.checks.filter((check) => check.level !== "ok").slice(0, 12).map((check, index) => (
                <div key={`${check.section}-${check.message}-${index}`} className={`runtime-doctor-row ${check.level}`}>
                  <span>{check.level}</span>
                  <strong>{check.section}</strong>
                  <small>{check.message}</small>
                </div>
              ))}
              {doctorStatus.checks.every((check) => check.level === "ok") && (
                <div className="panel-note">No Hermes doctor warnings.</div>
              )}
            </div>
          )}
        </div>
      )}

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
