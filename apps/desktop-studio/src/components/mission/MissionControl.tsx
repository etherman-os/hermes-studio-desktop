import React from "react";
import { useAdapterStore } from "../../stores/adapterStore";
import { useApprovalStore } from "../../stores/approvalStore";
import { useDelegationStore } from "../../stores/delegationStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useModelStore } from "../../stores/modelStore";
import { useProcessStore } from "../../stores/processStore";
import { useRunLedgerStore } from "../../stores/runLedgerStore";
import { useUiStore } from "../../stores/uiStore";
import { RUN_PRESETS, presetDraft } from "../../lib/runPresets";

// Mode mapping based on backend/active context
type HermesMode = "CREATE" | "CODE" | "AUTOMATE" | "MANAGE";

const MODE_LABELS: Record<HermesMode, string> = {
  CREATE: "Create Mode",
  CODE: "Code Mode",
  AUTOMATE: "Automate Mode",
  MANAGE: "Manage Mode",
};

interface ArsenalCard {
  id: string;
  label: string;
  count: number;
  items: string[];
}

// Get mode-specific arsenal content
function getModeArsenal(mode: HermesMode, skills: string[], toolsets: string[], mcpServers: string[]): ArsenalCard[] {
  switch (mode) {
    case "CREATE":
      return [
        { id: "creative-skills", label: "Creative Skills", count: skills.filter(s => ["popular-web-designs", "claude-design", "excalidraw", "manim-video", "ascii-video", "comfyui", "pixel-art", "writing-plans"].includes(s)).length, items: skills.slice(0, 6) },
        { id: "media-toolsets", label: "Media Toolsets", count: toolsets.filter(t => ["image_gen", "video", "vision", "browser"].includes(t)).length, items: toolsets.filter(t => ["image_gen", "video", "vision", "browser"].includes(t)) },
        { id: "creative-mcp", label: "MCP Servers", count: mcpServers.length, items: mcpServers.slice(0, 4) },
      ];
    case "CODE":
      return [
        { id: "dev-skills", label: "Development Skills", count: skills.filter(s => ["test-driven-development", "codebase-inspection", "systematic-debugging", "node-inspect-debugger", "requesting-code-review"].includes(s)).length, items: skills.slice(0, 6) },
        { id: "code-toolsets", label: "Code Toolsets", count: toolsets.filter(t => ["file", "terminal", "code_execution", "git"].includes(t)).length, items: toolsets.filter(t => ["file", "terminal", "code_execution", "git"].includes(t)) },
        { id: "debug-mcp", label: "Debug MCP", count: mcpServers.length, items: mcpServers.slice(0, 4) },
      ];
    case "AUTOMATE":
      return [
        { id: "automation-skills", label: "Automation Skills", count: skills.filter(s => ["kanban-orchestrator", "kanban-worker", "subagent-driven-development", "plan"].includes(s)).length, items: skills.slice(0, 6) },
        { id: "cron-toolsets", label: "Automation Stack", count: toolsets.filter(t => ["delegation", "todo", "cron", "extensions"].includes(t)).length, items: toolsets.filter(t => ["delegation", "todo", "cron", "extensions"].includes(t)) },
        { id: "workflow-mcp", label: "Workflow MCP", count: mcpServers.length, items: mcpServers.slice(0, 4) },
      ];
    case "MANAGE":
      return [
        { id: "manage-skills", label: "Management Skills", count: skills.filter(s => ["codebase-inspection", "writing-plans"].includes(s)).length, items: skills.slice(0, 6) },
        { id: "manage-toolsets", label: "Management Tools", count: toolsets.filter(t => ["sessions", "profiles", "approvals"].includes(t)).length, items: toolsets.filter(t => ["sessions", "profiles", "approvals"].includes(t)) },
        { id: "admin-mcp", label: "Admin MCP", count: mcpServers.length, items: mcpServers.slice(0, 4) },
      ];
  }
}

// Infer mode from activeBackend
function inferMode(activeBackend: string): HermesMode {
  switch (activeBackend.toLowerCase()) {
    case "cli":
      return "CODE";
    case "server":
      return "MANAGE";
    case "gateway":
      return "AUTOMATE";
    default:
      return "CODE";
  }
}

export function MissionControl() {
  const connected = useAdapterStore((s) => s.connected);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const activeBackend = useAdapterStore((s) => s.activeBackend);
  const hermesConnected = useAdapterStore((s) => s.hermesConnected);
  const fallbackReason = useAdapterStore((s) => s.fallbackReason);
  const runs = useRunLedgerStore((s) => s.runs);
  const loadRuns = useRunLedgerStore((s) => s.loadRecentRuns);
  const processes = useProcessStore((s) => s.processes);
  const templates = useProcessStore((s) => s.templates);
  const loadProcesses = useProcessStore((s) => s.loadProcesses);
  const startProcess = useProcessStore((s) => s.startProcess);
  const pendingApprovals = useApprovalStore((s) => s.pending);
  const loadApprovals = useApprovalStore((s) => s.loadPendingApprovals);
  const delegations = useDelegationStore((s) => s.delegations);
  const loadDelegations = useDelegationStore((s) => s.loadDelegations);
  const inventorySummary = useHermesInventoryStore((s) => s.summary);
  const skills = useHermesInventoryStore((s) => s.skills);
  const toolsets = useHermesInventoryStore((s) => s.toolsets);
  const mcpServers = useHermesInventoryStore((s) => s.mcpServers);
  const cliStatus = useHermesInventoryStore((s) => s.cliStatus);
  const checkpointStore = useHermesInventoryStore((s) => s.checkpointStore);
  const loadInventory = useHermesInventoryStore((s) => s.loadInventory);
  const loadLocalHermesStatus = useHermesInventoryStore((s) => s.loadLocalHermesStatus);
  const config = useModelStore((s) => s.config);
  const loadConfig = useModelStore((s) => s.loadConfig);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const openNewRun = useUiStore((s) => s.openNewRun);

  const activeMode = inferMode(activeBackend);
  const skillIds = skills.map(s => s.id);
  const toolsetIds = toolsets.map(t => t.id);
  const mcpIds = mcpServers.map(m => m.id);
  const arsenalCards = getModeArsenal(activeMode, skillIds, toolsetIds, mcpIds);
  const recentRuns = runs.slice(0, 3);

  React.useEffect(() => {
    if (!connected) return;
    void loadRuns();
    void loadProcesses();
    void loadApprovals();
    void loadDelegations();
    void loadInventory();
    void loadLocalHermesStatus();
    void loadConfig();
    const timer = window.setInterval(() => {
      void loadRuns();
      void loadProcesses();
      void loadApprovals();
      void loadDelegations();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [connected, loadApprovals, loadConfig, loadDelegations, loadInventory, loadLocalHermesStatus, loadProcesses, loadRuns]);

  const runningRuns = runs.filter((run) => run.status === "running" || run.status === "starting" || run.status === "queued").length;
  const activeProcesses = processes.filter((process) => process.status === "running" || process.status === "starting");
  const gatewayRunning = activeProcesses.some((process) => process.template_id === "hermes-gateway");
  const hasGatewayTemplate = templates.some((template) => template.id === "hermes-gateway");
  const activeBackendLabel = backendMode === "auto" ? activeBackend : backendMode;
  const latestRun = runs[0] ?? null;

  function refreshAll() {
    void loadRuns();
    void loadProcesses();
    void loadApprovals();
    void loadDelegations();
    void loadInventory();
    void loadLocalHermesStatus();
    void loadConfig();
  }

  return (
    <div className="mission-control">
      <div className="mission-command">
        <section className="mission-focus">
          <div className="workbench-eyebrow">Hermes Studio</div>
          <h2>Local production control for Hermes Agent</h2>
          <div className="mission-subtitle">
            {config ? `${config.provider} / ${config.model}` : "Model loading"} · {inventorySummary ? `${inventorySummary.installed_skill_count} skills · ${inventorySummary.mcp_server_count} MCP` : "inventory loading"} · {selectedStatus(connected, activeBackendLabel)}
          </div>
          <div className="mission-focus-actions">
            <button className="primary-button" onClick={() => openNewRun()}>
              New Local Run
            </button>
            <button className="tool-button" onClick={() => setActiveTab("runs")}>Open Run Ledger</button>
            <button className="tool-button" onClick={refreshAll}>Refresh</button>
          </div>
          <div className="mission-current-run">
            <span className={`status-dot status-${latestRun?.status ?? "idle"}`} />
            <div>
              <strong>{latestRun?.prompt || latestRun?.runId || "No active run yet"}</strong>
              <small>{latestRun ? `${latestRun.status} · ${latestRun.events.length} events` : "Start a run to populate timeline, artifacts, approvals, and logs."}</small>
            </div>
          </div>
        </section>

        <aside className="mission-status-stack" aria-label="Runtime status summary">
          <StatusRow label="Adapter" value={connected ? "Connected" : "Disconnected"} tone={connected ? "ok" : "danger"} />
          <StatusRow label="Backend" value={activeBackendLabel === "mock" ? "Studio simulation" : activeBackendLabel} tone={activeBackendLabel === "mock" ? "warn" : "neutral"} />
          <StatusRow label="Gateway" value={hermesConnected ? "Reachable" : gatewayRunning ? "Starting" : "Local CLI"} tone={hermesConnected || gatewayRunning ? "ok" : "neutral"} />
          <button
            className="tool-button mission-bridge-button"
            disabled={!hasGatewayTemplate || gatewayRunning}
            onClick={() => void startProcess("hermes-gateway")}
          >
            {gatewayRunning ? "Bridge Running" : "Gateway Bridge"}
          </button>
        </aside>
      </div>

      {fallbackReason && (
        <div className="inline-warning">
          Auto mode fallback: {fallbackReason}
        </div>
      )}

      <div className="mission-grid">
        <button className="mission-card" onClick={() => setActiveTab("runs")}>
          <span className="mission-card-label">Runs</span>
          <strong>{runningRuns}</strong>
          <span>{runs.length} recent ledger records</span>
        </button>
        <button className="mission-card" onClick={() => setActiveTab("approvals")}>
          <span className="mission-card-label">Approvals</span>
          <strong>{pendingApprovals.length}</strong>
          <span>waiting for a decision</span>
        </button>
        <button className="mission-card" onClick={() => setActiveTab("processes")}>
          <span className="mission-card-label">Processes</span>
          <strong>{activeProcesses.length}</strong>
          <span>{gatewayRunning ? "Hermes gateway is managed here" : "gateway can be started here"}</span>
        </button>
        <button className="mission-card" onClick={() => setActiveTab("extensions")}>
          <span className="mission-card-label">Hermes Arsenal</span>
          <strong>{inventorySummary?.toolset_count ?? 0}</strong>
          <span>{inventorySummary?.provider_count ?? 0} providers · {inventorySummary?.model_count ?? 0} models</span>
        </button>
      </div>

      <section className="mission-launchpad">
        <div className="mission-section-header">
          <div>
            <div className="inventory-section-title">Launchpad</div>
            <p>Focused starting points for production work.</p>
          </div>
        </div>
        <div className="mission-preset-grid" aria-label="Local Hermes run presets">
          {RUN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="mission-preset"
              onClick={() => openNewRun(presetDraft(preset))}
              title={preset.description}
            >
              <span>{preset.label}</span>
              <small>{preset.toolsets.slice(0, 4).join(" · ")}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="mission-recent-runs">
        <div className="inventory-section-title">Recent Runs</div>
        <div className="mission-recent-runs-grid">
          {recentRuns.length > 0 ? recentRuns.map((run, i) => (
            <div key={run.runId} className={`mission-recent-run ${i === 0 ? "most-recent" : ""}`}>
              <span className={`status-dot status-${run.status}`} />
              <div className="mission-recent-run-content">
                <strong>{run.prompt || run.runId}</strong>
                <small>{run.status} · {run.events.length} events</small>
              </div>
            </div>
          )) : (
            <div className="panel-note">No recent runs</div>
          )}
        </div>
      </section>

      <section className="mission-arsenal">
        <div className="mission-section-header">
          <div>
            <div className="inventory-section-title">Quick Capabilities</div>
            <p>{MODE_LABELS[activeMode]} · Skills, toolsets, and MCP servers relevant to current mode</p>
          </div>
          <span className="mode-badge">{activeMode}</span>
        </div>
        <div className="arsenal-cards-grid">
          {arsenalCards.map((card) => (
            <div key={card.id} className="arsenal-card">
              <div className="arsenal-card-header">
                <span className="arsenal-card-label">{card.label}</span>
                <span className="arsenal-card-count">{card.count}</span>
              </div>
              <div className="arsenal-card-items">
                {card.items.length > 0 ? card.items.map((item) => (
                  <span key={item} className="inventory-pill">{item}</span>
                )) : (
                  <span className="panel-note">No items</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mission-panels">
        <section className="mission-panel">
          <div className="inventory-section-title">Active Work</div>
          <div className="mission-list">
            {runs.slice(0, 6).map((run) => (
              <button key={run.runId} className="mission-list-row" onClick={() => setActiveTab("runs")}>
                <span>{run.prompt || run.runId}</span>
                <small>{run.status}</small>
              </button>
            ))}
            {runs.length === 0 && <div className="panel-note">No run activity yet</div>}
          </div>
        </section>

        <section className="mission-panel">
          <div className="inventory-section-title">Local Agents</div>
          <div className="mission-list">
            {delegations.slice(0, 6).map((delegation) => (
              <button key={delegation.id} className="mission-list-row" onClick={() => setActiveTab("delegations")}>
                <span>{delegation.tool_name || delegation.child_run_id}</span>
                <small>{delegation.status}</small>
              </button>
            ))}
            {delegations.length === 0 && <div className="panel-note">No delegations recorded</div>}
          </div>
        </section>

        <section className="mission-panel">
          <div className="inventory-section-title">Hermes Capabilities</div>
          <div className="mission-chip-cloud">
            {toolsets.slice(0, 12).map((toolset) => (
              <span key={toolset.id} className={`inventory-pill ${toolset.enabled ? "installed" : ""}`}>{toolset.id}</span>
            ))}
          </div>
        </section>

        <section className="mission-panel">
          <div className="inventory-section-title">Runtime Detail</div>
          <dl className="right-panel-info">
            <dt>Hermes CLI</dt>
            <dd>{cliStatus?.version ?? (cliStatus?.available === false ? "Unavailable" : "Loading")}</dd>
            <dt>Provider</dt>
            <dd>{config?.provider ?? "unknown"}</dd>
            <dt>Model</dt>
            <dd>{config?.model ?? "unknown"}</dd>
            <dt>Checkpoints</dt>
            <dd>{checkpointStore?.status?.total_size ?? (checkpointStore?.available ? "Available" : "Unknown")}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

function selectedStatus(connected: boolean, backend: string) {
  if (!connected) return "adapter offline";
  if (backend === "mock") return "studio simulation";
  return `${backend} backend`;
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "danger" | "neutral" }) {
  return (
    <div className={`mission-status-row tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
