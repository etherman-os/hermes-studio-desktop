import React from "react";
import { useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { ArtifactShelf } from "../artifacts/ArtifactShelf";
import { ChatSurface } from "../chat/ChatSurface";
import { RunLedger } from "../runs/RunLedger";
import { KanbanBoard } from "../kanban/KanbanBoard";
import { SessionsPanel } from "../sessions/SessionsPanel";
import { ProcessCockpit } from "../process/ProcessCockpit";
import { CheckpointTimeline } from "../checkpoints/CheckpointTimeline";
import { WorktreeLauncher } from "../worktrees/WorktreeLauncher";

const TABS = [
  { id: "runs", slot: "run_ledger" },
  { id: "chat", slot: "chat" },
  { id: "board", slot: "board" },
  { id: "sessions", slot: "sessions" },
  { id: "processes", slot: "processes" },
  { id: "checkpoints", slot: "checkpoints" },
  { id: "worktrees", slot: "worktrees" },
] as const;

const COMPONENT_MAP: Record<string, React.ComponentType> = {
  runs: RunLedger,
  chat: ChatSurface,
  board: KanbanBoard,
  sessions: SessionsPanel,
  processes: ProcessCockpit,
  checkpoints: CheckpointTimeline,
  worktrees: WorktreeLauncher,
};

export function CenterArea() {
  const activeTab = useLayoutStore((s) => s.activeTab);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const label = useThemeStore((s) => s.label);
  const [visitedTabs] = React.useState(() => new Set<string>(["runs"]));

  if (!visitedTabs.has(activeTab)) {
    visitedTabs.add(activeTab);
  }

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (idx + 1) % TABS.length;
      setActiveTab(TABS[next].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (idx - 1 + TABS.length) % TABS.length;
      setActiveTab(TABS[prev].id);
    }
  }

  return (
    <div className="center-area">
      <div className="center-tabs" role="tablist" aria-label="Center panels">
        {TABS.map((tab, idx) => (
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
        {TABS.map((tab) => {
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
