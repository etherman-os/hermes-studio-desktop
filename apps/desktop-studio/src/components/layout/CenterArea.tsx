import { useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { ArtifactShelf } from "../artifacts/ArtifactShelf";
import { ChatSurface } from "../chat/ChatSurface";
import { RunLedger } from "../runs/RunLedger";
import { KanbanBoard } from "../kanban/KanbanBoard";
import { SessionsPanel } from "../sessions/SessionsPanel";

const TABS = [
  { id: "runs", slot: "run_ledger" },
  { id: "chat", slot: "chat" },
  { id: "board", slot: "board" },
  { id: "sessions", slot: "sessions" },
  { id: "artifacts", slot: "artifacts" },
] as const;

export function CenterArea() {
  const activeTab = useLayoutStore((s) => s.activeTab);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const label = useThemeStore((s) => s.label);

  return (
    <div className="center-area">
      <div className="center-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`center-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {label(tab.slot)}
          </button>
        ))}
      </div>
      <div className="center-content">
        {activeTab === "runs" && <RunLedger />}
        {activeTab === "chat" && <ChatSurface />}
        {activeTab === "board" && <KanbanBoard />}
        {activeTab === "sessions" && <SessionsPanel />}
        {activeTab === "artifacts" && <ArtifactShelf />}
      </div>
    </div>
  );
}
