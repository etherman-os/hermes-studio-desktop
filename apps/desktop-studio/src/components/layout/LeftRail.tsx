import { useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";

const RAIL_ITEMS = [
  { id: "runs", slot: "runs" },
  { id: "chat", slot: "chat" },
  { id: "board", slot: "board" },
  { id: "sessions", slot: "sessions" },
  { id: "artifacts", slot: "artifacts" },
  { id: "context", slot: "context" },
  { id: "logs", slot: "logs" },
  { id: "theme_gallery", slot: "theme_gallery" },
  { id: "settings", slot: "settings" },
];

export function LeftRail() {
  const setSidebar = useLayoutStore((s) => s.setSidebarSection);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const sidebarSection = useLayoutStore((s) => s.sidebarSection);
  const activeTab = useLayoutStore((s) => s.activeTab);
  const icon = useThemeStore((s) => s.icon);
  const label = useThemeStore((s) => s.label);

  function handleClick(id: string) {
    if (["runs", "chat", "board", "sessions", "artifacts"].includes(id)) {
      setActiveTab(id);
    }
    if (id === "logs") {
      setBottomTab("logs");
    }
    setSidebar(id);
  }

  return (
    <div className="rail">
      {RAIL_ITEMS.map((item) => (
        <button
          key={item.id}
          className={`rail-icon ${sidebarSection === item.id || activeTab === item.id ? "active" : ""}`}
          onClick={() => handleClick(item.id)}
          title={label(item.slot)}
        >
          {icon(item.slot)}
        </button>
      ))}
    </div>
  );
}
