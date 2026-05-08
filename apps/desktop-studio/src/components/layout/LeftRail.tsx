import { type CenterTab, type SidebarSection, useLayoutStore } from "../../stores/layoutStore";
import { useApprovalStore } from "../../stores/approvalStore";
import { useThemeStore } from "../../stores/themeStore";

type RailItem = {
  id: SidebarSection | "git";
  slot: string;
  tooltip: string;
  tab?: CenterTab;
  section?: SidebarSection;
};

const RAIL_ITEMS: RailItem[] = [
  { id: "runs", slot: "runs", tooltip: "Runs & History" },
  { id: "chat", slot: "chat", tooltip: "Chat" },
  { id: "board", slot: "board", tooltip: "Board" },
  { id: "sessions", slot: "sessions", tooltip: "Sessions" },
  { id: "artifacts", slot: "artifacts", tooltip: "Artifacts" },
  { id: "processes", slot: "processes", tooltip: "Processes" },
  { id: "context", slot: "context", tooltip: "Context Inspector" },
  { id: "approvals", slot: "approvals", tooltip: "Approvals" },
  { id: "git", slot: "checkpoints", tooltip: "Git", tab: "checkpoints", section: "checkpoints" },
  { id: "extensions", slot: "extensions", tooltip: "Extensions" },
  { id: "delegations", slot: "delegations", tooltip: "Delegations" },
  { id: "cron", slot: "cron", tooltip: "Scheduled Jobs" },
  { id: "theme_gallery", slot: "theme_gallery", tooltip: "Themes" },
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

  function handleClick(item: RailItem) {
    if (item.id === "logs") {
      setBottomTab("logs");
    } else if (item.tab) {
      setActiveTab(item.tab);
    } else if (item.id === "settings") {
      setBottomTab("diagnostics");
    } else if (item.id !== "profiles" && item.id !== "theme_gallery") {
      setActiveTab(item.id);
    }
    const section = item.section ?? (item.id === "git" ? "checkpoints" : item.id);
    setSidebar(section);
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
            onClick={() => handleClick(item)}
            aria-label={item.tooltip}
            aria-current={isActive ? "page" : undefined}
            data-tooltip={item.tooltip}
            title={item.tooltip}
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
