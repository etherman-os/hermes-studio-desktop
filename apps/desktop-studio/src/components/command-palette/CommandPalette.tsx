import React from "react";
import { useUiStore } from "../../stores/uiStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";

interface PaletteCommand {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const close = useUiStore((s) => s.closeCommandPalette);
  const query = useUiStore((s) => s.commandPaletteQuery);
  const setQuery = useUiStore((s) => s.setCommandPaletteQuery);
  const selectedIndex = useUiStore((s) => s.selectedCommandIndex);
  const setSelected = useUiStore((s) => s.setSelectedCommandIndex);

  const toggleRight = useLayoutStore((s) => s.toggleRightPanel);
  const toggleBottom = useLayoutStore((s) => s.toggleBottomPanel);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const setSidebar = useLayoutStore((s) => s.setSidebarSection);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const setTheme = useThemeStore((s) => s.setTheme);
  const installedThemes = useThemeStore((s) => s.installedThemes);
  const themes = useThemeStore((s) => s.themes);

  const themeCommands = (installedThemes().length > 0 ? installedThemes() : Object.values(themes).map((theme) => ({
    id: theme.meta.id,
    name: theme.meta.name,
    description: theme.meta.description ?? "",
    author: theme.meta.author ?? "",
    version: theme.meta.version,
  }))).slice(0, 8).map((theme) => ({
    id: `theme-${theme.id}`,
    label: `Theme: ${theme.name}`,
    icon: "#",
    action: () => { setTheme(theme.id); close(); },
  }));

  const commands: PaletteCommand[] = [
    { id: "open-runs", label: "Open Run Ledger", icon: "R", shortcut: "Ctrl+1", action: () => { setActiveTab("runs"); setSidebar("runs"); close(); } },
    { id: "open-chat", label: "Open Chat", icon: "C", shortcut: "Ctrl+2", action: () => { setActiveTab("chat"); setSidebar("chat"); close(); } },
    { id: "open-board", label: "Open Board", icon: "B", shortcut: "Ctrl+3", action: () => { setActiveTab("board"); setSidebar("board"); close(); } },
    { id: "open-sessions", label: "Open Sessions", icon: "S", action: () => { setActiveTab("sessions"); setSidebar("sessions"); close(); } },
    { id: "open-artifacts", label: "Open Artifacts", icon: "A", action: () => { setActiveTab("artifacts"); setSidebar("artifacts"); close(); } },
    { id: "show-logs", label: "Show Logs", icon: "L", action: () => { setBottomTab("logs"); setSidebar("logs"); close(); } },
    { id: "show-diagnostics", label: "Show Adapter Diagnostics", icon: "D", action: () => { setBottomTab("adapter_diagnostics"); close(); } },
    { id: "switch-theme", label: "Switch Theme", icon: "#", action: () => { setSidebar("theme_gallery"); close(); } },
    { id: "open-settings", label: "Open Settings", icon: "*", action: () => { setSidebar("settings"); close(); } },
    { id: "toggle-right", label: "Toggle Right Panel", icon: "I", action: () => { toggleRight(); close(); } },
    { id: "toggle-bottom", label: "Toggle Bottom Panel", icon: "_", action: () => { toggleBottom(); close(); } },
    ...themeCommands,
  ];

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  React.useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(Math.min(selectedIndex + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected(Math.max(selectedIndex - 1, 0)); }
      if (e.key === "Enter" && filtered[selectedIndex]) { filtered[selectedIndex].action(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, selectedIndex, filtered, close, setSelected]);

  if (!open) return null;

  return (
    <div className="command-palette-overlay" onClick={close}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          className="command-palette-input"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="command-palette-list">
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`command-palette-item ${i === selectedIndex ? "selected" : ""}`}
              onClick={() => cmd.action()}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="command-palette-item-icon">{cmd.icon}</span>
              <span className="command-palette-item-label">{cmd.label}</span>
              {cmd.shortcut && <span className="command-palette-item-shortcut">{cmd.shortcut}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
