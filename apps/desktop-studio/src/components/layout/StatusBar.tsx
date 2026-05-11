import { useThemeStore } from "../../stores/themeStore";
import type { ThemeMode } from "../../stores/themeStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useApprovalStore } from "../../stores/approvalStore";
import { useProfileStore } from "../../stores/profileStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";

const THEME_CYCLE: ThemeMode[] = ["system", "light", "dark"];
const THEME_LABELS: Record<ThemeMode, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

export function StatusBar() {
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const themeMode = useThemeStore((s) => s.themeMode);
  const setThemeMode = useThemeStore((s) => s.setThemeMode);
  const connected = useAdapterStore((s) => s.connected);
  const checking = useAdapterStore((s) => s.checking);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const hermesConnected = useAdapterStore((s) => s.hermesConnected);
  const authError = useAdapterStore((s) => s.authError);
  const connectionMode = useAdapterStore((s) => s.connectionMode);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const runs = useRunLedgerStore((s) => s.runs);
  const currentRunId = useRunLedgerStore((s) => s.currentRunId);
  const pendingApprovals = useApprovalStore((s) => s.pending.length);

  // Connection mode indicator
  const modeColors: Record<string, string> = {
    real: "var(--app-ok)",
    mock: "var(--app-warn)",
    offline: "var(--app-danger)",
  };
  const modeLabels: Record<string, string> = {
    real: "Hermes",
    mock: "Demo Mode",
    offline: "Offline",
  };
  const modeColor = modeColors[connectionMode] ?? "var(--app-danger)";
  const modeLabel = modeLabels[connectionMode] ?? "Offline";

  const statusColor = connected ? "var(--app-ok)" : checking ? "var(--app-warn)" : "var(--app-danger)";
  const statusText = connected ? "Connected" : checking ? "Checking..." : authError ? "Auth missing" : "Disconnected";

  let backendLabel = backendMode;
  if (backendMode === "auto") {
    backendLabel = hermesConnected ? "Hermes" : "Studio";
  } else if (backendMode === "mock") {
    backendLabel = "Studio";
  }

  const profileName = activeProfile?.name ?? "unknown";
  const run = runs.find((item) => item.runId === currentRunId) ?? runs[0];

  function cycleThemeMode() {
    const idx = THEME_CYCLE.indexOf(themeMode);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setThemeMode(next);
  }

  return (
    <footer className="status-bar" role="contentinfo" aria-label="Status bar">
      <div className="status-item" data-testid="connection-status">
        <span className="status-dot" style={{ background: statusColor }} aria-hidden="true" />
        <span title={statusText}>{statusText}</span>
      </div>
      <div className="status-item" data-testid="profile-display">
        <span>{profileName}</span>
      </div>
      <div className="status-item" data-testid="connection-mode" title={`Connection mode: ${connectionMode}`}>
        <span className="status-dot" style={{ background: modeColor }} aria-hidden="true" />
        <span>{modeLabel}</span>
      </div>
      <div className="status-item">
        <span>{run ? run.status : "idle"}</span>
      </div>
      {pendingApprovals > 0 && (
        <div className="status-item status-attention">
          <span>{pendingApprovals} pending</span>
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div className="status-item">
        <span>{activeTheme().meta.name}</span>
      </div>
      <button
        className="status-item"
        onClick={cycleThemeMode}
        title={`Theme: ${THEME_LABELS[themeMode]} (click to cycle)`}
        style={{ cursor: "pointer", background: "none", border: "none", color: "inherit", padding: "0 4px" }}
        aria-label={`Switch theme mode, currently ${THEME_LABELS[themeMode]}`}
      >
        <span>{THEME_LABELS[themeMode]}</span>
      </button>
      <div className="status-item" style={{ opacity: 0.6, fontSize: "0.75em" }} title="Mode switching shortcuts">
        <span>Ctrl+1-4</span>
      </div>
    </footer>
  );
}
