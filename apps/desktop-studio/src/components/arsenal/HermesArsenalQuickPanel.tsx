import React from "react";
import { ChevronDown, ChevronRight, Wrench, Package, Server, Plus, Zap } from "lucide-react";
import { useAdapterStore } from "../../stores/adapterStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useUiStore } from "../../stores/uiStore";
import type { HermesSkill, HermesToolset } from "../../api/studioClient";

// Compact card for a single skill, toolset, or MCP server
function QuickCard({
  icon,
  label,
  category,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  category: string;
  onClick: () => void;
}) {
  return (
    <button className="arsenal-quick-card" onClick={onClick} title={label}>
      <span className="arsenal-quick-card-icon" aria-hidden="true">{icon}</span>
      <span className="arsenal-quick-card-category">{category}</span>
      <span className="arsenal-quick-card-label">{label}</span>
    </button>
  );
}

// Navigation targets for the quick panel items
type QuickNavTarget =
  | { type: "tab"; tab: "extensions"; subcategory?: string }
  | { type: "run"; prompt: string; skills?: string[]; toolsets?: string[] };

function buildSkillNav(skill: HermesSkill): QuickNavTarget {
  return {
    type: "run",
    prompt: `Use the ${skill.name} Hermes skill in this workspace. Inspect the relevant files first, then complete the requested work with verification.`,
    skills: [skill.cli_name || skill.name || skill.id],
    toolsets: ["file", "terminal", "code_execution", "skills"],
  };
}

function buildToolsetNav(toolset: HermesToolset): QuickNavTarget {
  return {
    type: "run",
    prompt: `Use the ${toolset.id} Hermes toolset while working in this local workspace. Gather context, execute the requested task, and return concrete results.`,
    toolsets: [toolset.id],
  };
}

// Status badge component
function StatusBadge({ value, label, variant }: { value: number; label: string; variant?: "default" | "active" | "warn" }) {
  const cls = variant === "active" ? "arsenal-stat active" : variant === "warn" ? "arsenal-stat warn" : "arsenal-stat";
  return (
    <span className={cls} title={label}>
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

export function HermesArsenalQuickPanel() {
  const connected = useAdapterStore((s) => s.connected);
  const skills = useHermesInventoryStore((s) => s.skills);
  const toolsets = useHermesInventoryStore((s) => s.toolsets);
  const mcpServers = useHermesInventoryStore((s) => s.mcpServers);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const openNewRun = useUiStore((s) => s.openNewRun);
  const [collapsed, setCollapsed] = React.useState(false);

  // Gate on Hermes connection
  if (!connected) {
    return null;
  }

  const installedSkills = skills.filter((s) => s.installed);
  const enabledToolsets = toolsets.filter((t) => t.enabled);
  const activeMcpServers = mcpServers.filter((m) => m.enabled);

  const totalSkills = installedSkills.length;
  const totalToolsets = enabledToolsets.length;
  const totalMcp = activeMcpServers.length;
  const hasAnyItems = totalSkills > 0 || totalToolsets > 0 || totalMcp > 0;

  if (!hasAnyItems) {
    return (
      <div className="arsenal-quick-panel arsenal-empty" data-testid="arsenal-panel">
        <button
          className="arsenal-quick-header"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label="Expand Hermes Arsenal quick panel"
          data-testid="arsenal-trigger"
        >
          <span className="arsenal-quick-logo" aria-hidden="true">H</span>
          <span className="arsenal-quick-title">Arsenal</span>
          <span className="arsenal-quick-chevron" aria-hidden="true">
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>
        </button>
        {!collapsed && (
          <div className="arsenal-empty-state">
            <div className="arsenal-empty-icon" aria-hidden="true">
              <Zap size={16} />
            </div>
            <p>No active Arsenal components yet</p>
            <button
              className="arsenal-enable-btn"
              onClick={() => setActiveTab("extensions")}
              title="Open Extensions to enable Hermes capabilities"
            >
              <Plus size={12} /> Enable capabilities
            </button>
          </div>
        )}
      </div>
    );
  }

  function handleNav(target: QuickNavTarget) {
    if (target.type === "tab") {
      setActiveTab(target.tab);
    } else if (target.type === "run") {
      openNewRun({
        mode: "task",
        prompt: target.prompt,
        skills: target.skills,
        toolsets: target.toolsets,
        checkpoints: true,
        maxTurns: 90,
      });
    }
  }

  return (
    <div className="arsenal-quick-panel" data-testid="arsenal-panel">
      {/* Header with collapse toggle */}
      <button
        className="arsenal-quick-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand Hermes Arsenal quick panel" : "Collapse Hermes Arsenal quick panel"}
        data-testid="arsenal-trigger"
      >
        <span className="arsenal-quick-logo" aria-hidden="true">H</span>
        <span className="arsenal-quick-title">Arsenal</span>
        {/* Status summary strip */}
        {!collapsed && (
          <span className="arsenal-quick-stats">
            <StatusBadge value={totalSkills} label="skills" variant={totalSkills > 0 ? "active" : "default"} />
            <StatusBadge value={totalToolsets} label="toolsets" variant={totalToolsets > 0 ? "active" : "default"} />
            <StatusBadge value={totalMcp} label="MCP" variant={totalMcp > 0 ? "active" : "default"} />
          </span>
        )}
        <span className="arsenal-quick-chevron" aria-hidden="true">
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>

      {!collapsed && (
        <>
          {/* Skills section */}
          {installedSkills.length > 0 && (
            <div className="arsenal-quick-section">
              <div className="arsenal-quick-section-label">Skills</div>
              <div className="arsenal-quick-grid">
                {installedSkills.slice(0, 5).map((skill) => (
                  <QuickCard
                    key={skill.id}
                    icon={<Wrench size={12} />}
                    label={skill.name}
                    category={skill.category}
                    onClick={() => handleNav(buildSkillNav(skill))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Toolsets section */}
          {enabledToolsets.length > 0 && (
            <div className="arsenal-quick-section">
              <div className="arsenal-quick-section-label">Toolsets</div>
              <div className="arsenal-quick-grid">
                {enabledToolsets.slice(0, 3).map((toolset) => (
                  <QuickCard
                    key={`${toolset.platform}:${toolset.id}`}
                    icon={<Package size={12} />}
                    label={toolset.id}
                    category={toolset.platform}
                    onClick={() => handleNav(buildToolsetNav(toolset))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* MCP Servers section */}
          {activeMcpServers.length > 0 && (
            <div className="arsenal-quick-section">
              <div className="arsenal-quick-section-label">MCP</div>
              <div className="arsenal-quick-grid">
                {activeMcpServers.slice(0, 3).map((server) => (
                  <QuickCard
                    key={server.id}
                    icon={<Server size={12} />}
                    label={server.id}
                    category="server"
                    onClick={() => setActiveTab("extensions")}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Quick action: enable more */}
          <div className="arsenal-quick-actions">
            <button
              className="arsenal-enable-btn"
              onClick={() => setActiveTab("extensions")}
              title="Open Extensions to manage Hermes Arsenal"
            >
              <Plus size={12} /> Manage Arsenal
            </button>
          </div>
        </>
      )}
    </div>
  );
}