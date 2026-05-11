import {
  Activity,
  Clock,
  Cpu,
  FileText,
  GitBranch,
  MessageSquare,
  Package,
  Palette,
  Play,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  type CenterTab,
  type Mode,
  type SidebarSection,
  useLayoutStore,
} from "../../stores/layoutStore";
import { useApprovalStore } from "../../stores/approvalStore";

type RailItem = {
  id: SidebarSection;
  mode?: Mode;
  tooltip: string;
  icon: LucideIcon;
  tab?: CenterTab;
  section?: SidebarSection;
};

type ModeGroup = {
  mode: Mode;
  label: string;
  icon: LucideIcon;
  items: RailItem[];
};

// CREATE mode items
const CREATE_ITEMS: RailItem[] = [
  { id: "mission", mode: "create", tooltip: "Mission Control", icon: Sparkles, tab: "mission", section: "mission" },
  { id: "design", mode: "create", tooltip: "Design Canvas", icon: Package, tab: "design", section: "design" },
  { id: "artifacts", mode: "create", tooltip: "Artifacts", icon: Package, tab: "artifacts", section: "artifacts" },
  { id: "board", mode: "create", tooltip: "Board", icon: Play, tab: "board", section: "board" },
  { id: "chat", mode: "create", tooltip: "Chat", icon: MessageSquare, tab: "chat", section: "chat" },
];

// CODE mode items
const CODE_ITEMS: RailItem[] = [
  { id: "runs", mode: "code", tooltip: "Runs & History", icon: Activity, tab: "runs", section: "runs" },
  { id: "processes", mode: "code", tooltip: "Processes", icon: Cpu, tab: "processes", section: "processes" },
  { id: "checkpoints", mode: "code", tooltip: "Checkpoints", icon: Clock, tab: "checkpoints", section: "checkpoints" },
  { id: "worktrees", mode: "code", tooltip: "Worktrees", icon: GitBranch, tab: "worktrees", section: "worktrees" },
];

// AUTOMATE mode items
const AUTOMATE_ITEMS: RailItem[] = [
  { id: "extensions", mode: "automate", tooltip: "Extensions", icon: Package, tab: "extensions", section: "extensions" },
  { id: "delegations", mode: "automate", tooltip: "Delegations", icon: Repeat, tab: "delegations", section: "delegations" },
  { id: "cron", mode: "automate", tooltip: "Cron", icon: Clock, tab: "cron", section: "cron" },
  { id: "context", mode: "automate", tooltip: "Context Inspector", icon: Search, tab: "context", section: "context" },
];

// MANAGE mode items
const MANAGE_ITEMS: RailItem[] = [
  { id: "sessions", mode: "manage", tooltip: "Sessions", icon: Play, tab: "sessions", section: "sessions" },
  { id: "approvals", mode: "manage", tooltip: "Approvals", icon: ShieldCheck, tab: "approvals", section: "approvals" },
  { id: "profiles", mode: "manage", tooltip: "Profiles", icon: Package, tab: "profiles", section: "profiles" },
  { id: "settings", mode: "manage", tooltip: "Settings", icon: Settings, tab: "settings", section: "settings" },
];

// Mode group definitions (matches layoutStore MODE_SURFACES order)
const MODE_GROUPS: ModeGroup[] = [
  { mode: "create", label: "CREATE", icon: Sparkles, items: CREATE_ITEMS },
  { mode: "code", label: "CODE", icon: Activity, items: CODE_ITEMS },
  { mode: "automate", label: "AUTOMATE", icon: Play, items: AUTOMATE_ITEMS },
  { mode: "manage", label: "MANAGE", icon: Settings, items: MANAGE_ITEMS },
];

// System items (always visible regardless of mode)
const SYSTEM_RAIL_ITEMS: RailItem[] = [
  { id: "theme_gallery", tooltip: "Themes", icon: Palette, section: "theme_gallery" },
  { id: "logs", tooltip: "Logs", icon: FileText, section: "logs" },
];

const MORE_SECTIONS: SidebarSection[] = [
  "more",
  "board",
  "sessions",
  "checkpoints",
  "worktrees",
  "extensions",
  "delegations",
  "cron",
  "profiles",
];

export function LeftRail() {
  const setSidebar = useLayoutStore((s) => s.setSidebarSection);
  const showSidebar = useLayoutStore((s) => s.showSidebar);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const setActiveMode = useLayoutStore((s) => s.setActiveMode);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const openBottomPanel = useLayoutStore((s) => s.openBottomPanel);
  const sidebarSection = useLayoutStore((s) => s.sidebarSection);
  const activeTab = useLayoutStore((s) => s.activeTab);
  const activeMode = useLayoutStore((s) => s.activeMode);
  const pendingApprovals = useApprovalStore((s) => s.pending.length);

  function handleClick(item: RailItem) {
    if (item.id === "logs") {
      setBottomTab("logs");
      openBottomPanel();
    } else if (item.id === "theme_gallery") {
      // Theme gallery is handled by a separate modal, no tab switch needed
    } else if (item.tab && item.mode) {
      setActiveMode(item.mode);
      setActiveTab(item.tab);
    } else if (item.tab) {
      setActiveTab(item.tab);
    }
    const section = item.section ?? item.id;
    setSidebar(section);
    showSidebar();
  }

  function isItemActive(item: RailItem) {
    if (item.id === "more") {
      return MORE_SECTIONS.includes(sidebarSection) ||
        MORE_SECTIONS.includes(activeTab as SidebarSection);
    }
    return sidebarSection === item.id || activeTab === item.id;
  }

  function renderItem(item: RailItem) {
    const isActive = isItemActive(item);
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`rail-icon ${isActive ? "active" : ""}`}
        onClick={() => handleClick(item)}
        aria-label={item.tooltip}
        aria-current={isActive ? "page" : undefined}
        title={item.tooltip}
        data-mode={item.mode ?? undefined}
      >
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
        {item.id === "approvals" && pendingApprovals > 0 && (
          <span className="rail-badge" aria-label={`${pendingApprovals} pending approvals`}>{pendingApprovals}</span>
        )}
      </button>
    );
  }

  // Get the active mode group
  const activeGroup = MODE_GROUPS.find((g) => g.mode === activeMode) ?? MODE_GROUPS[0];

  return (
    <nav className="rail" role="navigation" aria-label="Main navigation">
      {/* Mode sections - show only the active mode's items */}
      <div className="rail-section rail-section-modes">
        {MODE_GROUPS.map((group) => (
          <div key={group.mode} className="rail-mode-group" data-mode-active={group.mode === activeMode}>
            {group.items.map(renderItem)}
          </div>
        ))}
      </div>
      {/* System items always visible */}
      <div className="rail-section rail-section-system">
        {SYSTEM_RAIL_ITEMS.map(renderItem)}
      </div>
    </nav>
  );
}
