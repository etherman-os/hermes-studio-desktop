import React, { Suspense } from "react";
import { CENTER_TABS, MODE_SURFACES, type CenterTab, useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { LoadingFallback } from "../common/LoadingFallback";
import { ApprovalCenter } from "../approvals/ApprovalCenter";
import { ContextInspector } from "../context/ContextInspector";
import { CronPanel } from "../cron/CronPanel";
import { CronSurface } from "../cron/CronSurface";
import { DelegationsSurface } from "../delegation/DelegationsSurface";
import { DelegationPanel } from "../delegation/DelegationPanel";
import { KanbanBoard } from "../kanban/KanbanBoard";
import { ProcessCockpit } from "../process/ProcessCockpit";
import { RunLedger } from "../runs/RunLedger";
import { SessionsPanel } from "../sessions/SessionsPanel";
import { CheckpointTimeline } from "../checkpoints/CheckpointTimeline";
import { WorktreeLauncher } from "../worktrees/WorktreeLauncher";
import { ProfilesSurface } from "../profiles/ProfilesSurface";
import { SettingsSurface } from "../settings/SettingsSurface";

// Lazy-loaded heavy components - code-split to reduce initial bundle
const ChatSurface = React.lazy(() => import("../chat/ChatSurface") as unknown as Promise<{ default: React.ComponentType<{}> }>);
const DesignCanvas = React.lazy(() => import("../design/DesignCanvas") as unknown as Promise<{ default: React.ComponentType<{}> }>);
const MissionControl = React.lazy(() => import("../mission/MissionControl") as unknown as Promise<{ default: React.ComponentType<{}> }>);
const ArtifactShelf = React.lazy(() => import("../artifacts/ArtifactShelf") as unknown as Promise<{ default: React.ComponentType<{}> }>);
const ExtensionsPanel = React.lazy(() => import("../extensions/ExtensionsPanel") as unknown as Promise<{ default: React.ComponentType<{}> }>);

const TAB_META: Record<CenterTab, { slot: string }> = {
  mission: { slot: "mission" },
  runs: { slot: "run_ledger" },
  chat: { slot: "chat" },
  board: { slot: "board" },
  sessions: { slot: "sessions" },
  design: { slot: "design" },
  artifacts: { slot: "artifacts" },
  processes: { slot: "processes" },
  checkpoints: { slot: "checkpoints" },
  worktrees: { slot: "worktrees" },
  context: { slot: "context" },
  approvals: { slot: "approvals" },
  extensions: { slot: "extensions" },
  delegations: { slot: "delegations" },
  cron: { slot: "cron" },
  profiles: { slot: "profiles" },
  settings: { slot: "settings" },
};

const COMPONENT_MAP: Record<CenterTab, React.ComponentType> = {
  mission: MissionControl,
  runs: RunLedger,
  chat: ChatSurface,
  board: KanbanBoard,
  sessions: SessionsPanel,
  design: DesignCanvas,
  artifacts: ArtifactShelf,
  processes: ProcessCockpit,
  checkpoints: CheckpointTimeline,
  worktrees: WorktreeLauncher,
  context: ContextInspector,
  approvals: ApprovalCenter,
  extensions: ExtensionsPanel,
  delegations: DelegationsSurface,
  cron: CronSurface,
  profiles: ProfilesSurface,
  settings: SettingsSurface,
};

const PRIMARY_CENTER_TABS: CenterTab[] = [
  "mission",
  "runs",
  "chat",
  "design",
  "artifacts",
  "processes",
];

export function CenterArea() {
  const activeTab = useLayoutStore((s) => s.activeTab);
  const activeMode = useLayoutStore((s) => s.activeMode);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const label = useThemeStore((s) => s.label);
  const [visitedTabs] = React.useState(() => new Set<CenterTab>(["runs"]));

  // Phase 2: Only mount surfaces relevant to the active mode (plus always-visible surfaces)
  const alwaysVisibleSurfaces: CenterTab[] = ["mission"];
  const modeSurfaces = MODE_SURFACES[activeMode] ?? [];
  const surfacesToMount = React.useMemo(() => {
    const mounted = new Set<CenterTab>([...alwaysVisibleSurfaces, ...modeSurfaces]);
    return CENTER_TABS.filter((tab) => mounted.has(tab));
  }, [activeMode, modeSurfaces]);
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
        {surfacesToMount.map((tabId) => {
          // Fallback to activeTab for tabs not yet in MODE_SURFACES (migration safety)
          if (!visitedTabs.has(tabId)) return null;
          const Component = COMPONENT_MAP[tabId];
          // Phase 2: Memoize each surface component to prevent unnecessary re-renders
          const MemoizedComponent = React.memo(Component);
          return (
            <div
              key={tabId}
              style={{ display: activeTab === tabId ? "contents" : "none" }}
            >
              <Suspense fallback={<LoadingFallback />}>
                <MemoizedComponent />
              </Suspense>
            </div>
          );
        })}
      </div>
    </div>
  );
}
