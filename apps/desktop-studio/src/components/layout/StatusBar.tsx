import { useThemeStore } from "../../stores/themeStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useProfileStore } from "../../stores/profileStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";

export function StatusBar() {
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const connected = useAdapterStore((s) => s.connected);
  const checking = useAdapterStore((s) => s.checking);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const hermesConnected = useAdapterStore((s) => s.hermesConnected);
  const authError = useAdapterStore((s) => s.authError);
  const fallbackReason = useAdapterStore((s) => s.fallbackReason);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const runs = useRunLedgerStore((s) => s.runs);
  const currentRunId = useRunLedgerStore((s) => s.currentRunId);

  const statusColor = connected ? "var(--app-ok)" : checking ? "var(--app-warn)" : "var(--app-danger)";
  const statusText = connected ? "Connected" : checking ? "Checking..." : authError ? "Auth token missing" : "Disconnected";

  let backendLabel = backendMode;
  if (backendMode === "auto") {
    backendLabel = hermesConnected ? "Hermes" : "Mock (auto)";
  } else if (backendMode === "hermes") {
    backendLabel = hermesConnected ? "Hermes" : "Hermes (unreachable)";
  } else if (backendMode === "mock") {
    backendLabel = "Mock";
  }

  const profileName = activeProfile?.name ?? "unknown";
  const adapterTitle = authError ?? fallbackReason ?? statusText;
  const run = runs.find((item) => item.runId === currentRunId) ?? runs[0];

  return (
    <div className="status-bar">
      <div className="status-item">
        <span className="status-dot" />
        <span>{profileName}</span>
      </div>
      <div className="status-item">
        <span>{run ? `Run: ${run.status}` : "Run: idle"}</span>
      </div>
      <div style={{ flex: 1 }} />
      <div className="status-item">
        <span className="status-dot" style={{ background: statusColor }} />
        <span title={adapterTitle}>Adapter: {statusText}</span>
      </div>
      {connected && (
        <div className="status-item">
          <span>Backend: {backendLabel}</span>
        </div>
      )}
      <div className="status-item">
        <span>{activeTheme().meta.name}</span>
      </div>
      <div className="status-item">
        <span>v0.1.0</span>
      </div>
    </div>
  );
}
