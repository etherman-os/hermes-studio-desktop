import React from "react";
import {
  Activity,
  BookOpen,
  LayoutGrid,
  Play,
  Settings,
  FileText,
  Search,
  MessageSquare,
  Clock,
  Palette,
  Package,
  type LucideIcon,
} from "lucide-react";
import {
  type CenterTab,
  type Mode,
  type SidebarSection,
  useLayoutStore,
} from "../../stores/layoutStore";

type RailSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: RailItem[];
};

type RailItem = {
  id: SidebarSection;
  tooltip: string;
  icon: LucideIcon;
  tab?: CenterTab;
  mode?: Mode;
  section?: SidebarSection;
  isBottomPanel?: boolean;
};

// Section definitions: 4 simplified sections
const RAIL_SECTIONS: RailSection[] = [
  {
    id: "work",
    label: "Work",
    icon: Play,
    items: [
      { id: "runs", tooltip: "Runs / Run Ledger", icon: Activity, tab: "runs", mode: "code" },
      { id: "chat", tooltip: "Chat", icon: MessageSquare, tab: "chat", mode: "create" },
      { id: "sessions", tooltip: "Sessions", icon: Clock, tab: "sessions", mode: "manage" },
    ],
  },
  {
    id: "board",
    label: "Board",
    icon: LayoutGrid,
    items: [
      { id: "board", tooltip: "Kanban Board", icon: BookOpen, tab: "board", mode: "create" },
    ],
  },
  {
    id: "inspect",
    label: "Inspect",
    icon: Search,
    items: [
      { id: "artifacts", tooltip: "Artifacts", icon: Package, tab: "artifacts", mode: "create" },
      { id: "context", tooltip: "Context Inspector", icon: Search, tab: "context", mode: "automate" },
      { id: "logs", tooltip: "Logs", icon: FileText, isBottomPanel: true },
    ],
  },
  {
    id: "configure",
    label: "Configure",
    icon: Settings,
    items: [
      { id: "theme_gallery", tooltip: "Themes", icon: Palette, section: "theme_gallery" },
      { id: "settings", tooltip: "Settings", icon: Settings, tab: "settings", mode: "manage" },
    ],
  },
];

// Arsenal/Hermes Inventory is accessible via the sidebar when in Manage mode
// It appears in the sidebar as HermesArsenalQuickPanel

export function ActivityRail4() {
  const [expandedSection, setExpandedSection] = React.useState<string | null>(null);
  const setSidebar = useLayoutStore((s) => s.setSidebarSection);
  const showSidebar = useLayoutStore((s) => s.showSidebar);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const setActiveMode = useLayoutStore((s) => s.setActiveMode);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const openBottomPanel = useLayoutStore((s) => s.openBottomPanel);
  const sidebarSection = useLayoutStore((s) => s.sidebarSection);
  const activeTab = useLayoutStore((s) => s.activeTab);
  const activeMode = useLayoutStore((s) => s.activeMode);

  function handleSectionClick(sectionId: string) {
    if (expandedSection === sectionId) {
      setExpandedSection(null);
    } else {
      setExpandedSection(sectionId);
    }
  }

  function handleItemClick(item: RailItem) {
    if (item.isBottomPanel) {
      setBottomTab("logs");
      openBottomPanel();
    } else if (item.tab && item.mode) {
      setActiveMode(item.mode);
      setActiveTab(item.tab);
    } else if (item.tab) {
      setActiveTab(item.tab);
    }
    const section = item.section ?? item.id;
    setSidebar(section);
    showSidebar();
    setExpandedSection(null);
  }

  function isSectionActive(section: RailSection): boolean {
    return section.items.some((item) => {
      if (item.isBottomPanel) {
        return false; // Bottom panel items don't mark section as active in sidebar
      }
      return sidebarSection === item.id || activeTab === item.tab;
    });
  }

  return (
    <nav className="activity-rail" role="navigation" aria-label="Main navigation">
      <div className="rail-sections">
        {RAIL_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isExpanded = expandedSection === section.id;
          const isActive = isSectionActive(section);

          return (
            <div key={section.id} className="rail-section-container">
              <button
                className={`rail-section-btn ${isActive ? "active" : ""} ${isExpanded ? "expanded" : ""}`}
                onClick={() => handleSectionClick(section.id)}
                aria-label={section.label}
                aria-expanded={isExpanded}
                title={section.label}
              >
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
              </button>

              {isExpanded && (
                <div className="rail-section-popover" role="menu">
                  <div className="rail-popover-header">{section.label}</div>
                  {section.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isItemActive = sidebarSection === item.id || activeTab === item.tab;
                    return (
                      <button
                        key={item.id}
                        className={`rail-popover-item ${isItemActive ? "active" : ""}`}
                        onClick={() => handleItemClick(item)}
                        role="menuitem"
                        title={item.tooltip}
                      >
                        <ItemIcon size={14} strokeWidth={2} aria-hidden="true" />
                        <span>{item.tooltip}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Overlay to close popover when clicking outside */}
      {expandedSection && (
        <div
          className="rail-overlay"
          onClick={() => setExpandedSection(null)}
          aria-hidden="true"
        />
      )}
    </nav>
  );
}