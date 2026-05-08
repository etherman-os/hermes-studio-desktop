import React from "react";
import { CENTER_TABS, type CenterTab, useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { ArtifactShelf } from "../artifacts/ArtifactShelf";
import { ApprovalCenter } from "../approvals/ApprovalCenter";
import { ChatSurface } from "../chat/ChatSurface";
import { ContextInspector } from "../context/ContextInspector";
import { CronPanel } from "../cron/CronPanel";
import { DelegationPanel } from "../delegation/DelegationPanel";
import { ExtensionsPanel } from "../extensions/ExtensionsPanel";
import { KanbanBoard } from "../kanban/KanbanBoard";
import { ProcessCockpit } from "../process/ProcessCockpit";
import { RunLedger } from "../runs/RunLedger";
import { SessionsPanel } from "../sessions/SessionsPanel";
import { CheckpointTimeline } from "../checkpoints/CheckpointTimeline";
import { WorktreeLauncher } from "../worktrees/WorktreeLauncher";

const TAB_META: Record<CenterTab, { slot: string }> = {
  runs: { slot: "run_ledger" },
  chat: { slot: "chat" },
  board: { slot: "board" },
  sessions: { slot: "sessions" },
  artifacts: { slot: "artifacts" },
  processes: { slot: "processes" },
  checkpoints: { slot: "checkpoints" },
  worktrees: { slot: "worktrees" },
  context: { slot: "context" },
  approvals: { slot: "approvals" },
  extensions: { slot: "extensions" },
  delegations: { slot: "delegations" },
  cron: { slot: "cron" },
};

const COMPONENT_MAP: Record<CenterTab, React.ComponentType> = {
  runs: RunLedger,
  chat: ChatSurface,
  board: KanbanBoard,
  sessions: SessionsPanel,
  artifacts: ArtifactShelf,
  processes: ProcessCockpit,
  checkpoints: CheckpointTimeline,
  worktrees: WorktreeLauncher,
  context: ContextInspector,
  approvals: ApprovalCenter,
  extensions: ExtensionsPanel,
  delegations: DelegationPanel,
  cron: CronPanel,
};

const PRIMARY_CENTER_TABS: CenterTab[] = [
  "runs",
  "chat",
  "board",
  "sessions",
  "artifacts",
  "processes",
  "context",
  "approvals",
];

export function CenterArea() {
  const activeTab = useLayoutStore((s) => s.activeTab);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const label = useThemeStore((s) => s.label);
  const [visitedTabs] = React.useState(() => new Set<CenterTab>(["runs"]));
  const tabs = React.useMemo(() => {
    const visibleIds = PRIMARY_CENTER_TABS.includes(activeTab)
      ? PRIMARY_CENTER_TABS
      : [...PRIMARY_CENTER_TABS, activeTab];
    return visibleIds.map((id) => ({ id, ...TAB_META[id] }));
  }, [activeTab]);

  if (!visitedTabs.has(activeTab)) {
    visitedTabs.add(activeTab);
  }

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (idx + 1) % tabs.length;
      setActiveTab(tabs[next].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (idx - 1 + tabs.length) % tabs.length;
      setActiveTab(tabs[prev].id);
    }
  }

  return (
    <div className="center-area">
      <div className="center-tabs" role="tablist" aria-label="Center panels">
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`center-panel-${tab.id}`}
            id={`center-tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`center-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, idx)}
          >
            {label(tab.slot)}
          </button>
        ))}
      </div>
      <div className="center-content" role="tabpanel" id={`center-panel-${activeTab}`} aria-labelledby={`center-tab-${activeTab}`}>
        {CENTER_TABS.map((tabId) => {
          const tab = { id: tabId, ...TAB_META[tabId] };
          if (!visitedTabs.has(tab.id)) return null;
          const Component = COMPONENT_MAP[tab.id];
          return (
            <div
              key={tab.id}
              style={{ display: activeTab === tab.id ? "contents" : "none" }}
            >
              <Component />
            </div>
          );
        })}
      </div>
    </div>
  );
}
