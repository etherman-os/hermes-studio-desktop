import { useLayoutStore } from "../../stores/layoutStore";
import { useApprovalStore } from "../../stores/approvalStore";
import { useThemeStore } from "../../stores/themeStore";

const RAIL_ITEMS = [
  { id: "runs", slot: "runs", tooltip: "Runs & History" },
  { id: "chat", slot: "chat", tooltip: "Chat" },
  { id: "board", slot: "board", tooltip: "Board" },
  { id: "sessions", slot: "sessions", tooltip: "Sessions" },
  { id: "processes", slot: "processes", tooltip: "Processes" },
  { id: "git", slot: "checkpoints", tooltip: "Git" },
  { id: "logs", slot: "logs", tooltip: "Logs" },
  { id: "settings", slot: "settings", tooltip: "Settings" },
];

export function LeftRail() {
  const setSidebar = useLayoutStore((s) => s.setSidebarSection);
  const showSidebar = useLayoutStore((s) => s.showSidebar);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const sidebarSection = useLayoutStore((s) => s.sidebarSection);
  const activeTab = useLayoutStore((s) => s.activeTab);
  const pendingApprovals = useApprovalStore((s) => s.pending.length);
  const icon = useThemeStore((s) => s.icon);
  const label = useThemeStore((s) => s.label);

  function handleClick(id: string) {
    if (id === "logs") {
      setBottomTab("logs");
    } else if (id === "git") {
      setActiveTab("checkpoints");
      setSidebar("checkpoints");
      showSidebar();
      return;
    } else {
      setActiveTab(id);
    }
    setSidebar(id);
    showSidebar();
  }

  return (
    <nav className="rail" role="navigation" aria-label="Main navigation">
      {RAIL_ITEMS.map((item) => {
        const isActive = sidebarSection === item.id || activeTab === item.id ||
          (item.id === "git" && (sidebarSection === "checkpoints" || sidebarSection === "worktrees" || activeTab === "checkpoints" || activeTab === "worktrees"));
        return (
          <button
            key={item.id}
            className={`rail-icon ${isActive ? "active" : ""}`}
            onClick={() => handleClick(item.id)}
            aria-label={item.tooltip}
            aria-current={isActive ? "page" : undefined}
            data-tooltip={item.tooltip}
          >
            {icon(item.slot)}
            {item.id === "settings" && pendingApprovals > 0 && (
              <span className="rail-badge" aria-label={`${pendingApprovals} pending approvals`}>{pendingApprovals}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
