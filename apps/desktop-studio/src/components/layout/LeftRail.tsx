import {
  Activity,
  Boxes,
  CalendarClock,
  Columns3,
  Cpu,
  FileText,
  GitBranch,
  History,
  MessageSquare,
  Package,
  Palette,
  Puzzle,
  Search,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { type CenterTab, type SidebarSection, useLayoutStore } from "../../stores/layoutStore";
import { useApprovalStore } from "../../stores/approvalStore";

type RailItem = {
  id: SidebarSection | "git";
  slot: string;
  tooltip: string;
  icon: LucideIcon;
  tab?: CenterTab;
  section?: SidebarSection;
};

const RAIL_ITEMS: RailItem[] = [
  { id: "runs", slot: "runs", tooltip: "Runs & History", icon: Activity },
  { id: "chat", slot: "chat", tooltip: "Chat", icon: MessageSquare },
  { id: "board", slot: "board", tooltip: "Board", icon: Columns3 },
  { id: "sessions", slot: "sessions", tooltip: "Sessions", icon: History },
  { id: "artifacts", slot: "artifacts", tooltip: "Artifacts", icon: Package },
  { id: "processes", slot: "processes", tooltip: "Processes", icon: Cpu },
  { id: "context", slot: "context", tooltip: "Context Inspector", icon: Search },
  { id: "approvals", slot: "approvals", tooltip: "Approvals", icon: ShieldCheck },
  { id: "git", slot: "checkpoints", tooltip: "Git", icon: GitBranch, tab: "checkpoints", section: "checkpoints" },
  { id: "extensions", slot: "extensions", tooltip: "Hermes Arsenal", icon: Puzzle },
  { id: "delegations", slot: "delegations", tooltip: "Delegations", icon: Boxes },
  { id: "cron", slot: "cron", tooltip: "Scheduled Jobs", icon: CalendarClock },
  { id: "theme_gallery", slot: "theme_gallery", tooltip: "Themes", icon: Palette },
  { id: "logs", slot: "logs", tooltip: "Logs", icon: FileText },
  { id: "settings", slot: "settings", tooltip: "Settings", icon: Settings },
];

export function LeftRail() {
  const setSidebar = useLayoutStore((s) => s.setSidebarSection);
  const showSidebar = useLayoutStore((s) => s.showSidebar);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const sidebarSection = useLayoutStore((s) => s.sidebarSection);
  const activeTab = useLayoutStore((s) => s.activeTab);
  const pendingApprovals = useApprovalStore((s) => s.pending.length);

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
        const Icon = item.icon;
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
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
            {item.id === "approvals" && pendingApprovals > 0 && (
              <span className="rail-badge" aria-label={`${pendingApprovals} pending approvals`}>{pendingApprovals}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
