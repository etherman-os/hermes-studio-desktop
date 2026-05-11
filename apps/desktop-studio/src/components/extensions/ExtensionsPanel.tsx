import React from "react";
import { useToolPackStore } from "../../stores/toolPackStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
import { useThemeStore } from "../../stores/themeStore";
import { useUiStore } from "../../stores/uiStore";
import { EmptyState } from "../common/EmptyState";
import { Package } from "lucide-react";
import type { HermesSkill, ToolPackInfo } from "../../api/studioClient";

type CatalogTab = "overview" | "skills" | "mcp" | "packs";

export function ExtensionsPanel() {
  const packs = useToolPackStore((s) => s.packs);
  const loading = useToolPackStore((s) => s.loading);
  const error = useToolPackStore((s) => s.error);
  const loadPacks = useToolPackStore((s) => s.loadPacks);
  const enablePack = useToolPackStore((s) => s.enablePack);
  const disablePack = useToolPackStore((s) => s.disablePack);
  const installPack = useToolPackStore((s) => s.installPack);
  const clearError = useToolPackStore((s) => s.clearError);
  const inventorySummary = useHermesInventoryStore((s) => s.summary);
  const providers = useHermesInventoryStore((s) => s.providers);
  const models = useHermesInventoryStore((s) => s.models);
  const skills = useHermesInventoryStore((s) => s.skills);
  const mcpServers = useHermesInventoryStore((s) => s.mcpServers);
  const toolsets = useHermesInventoryStore((s) => s.toolsets);
  const fallbackProviders = useHermesInventoryStore((s) => s.fallbackProviders);
  const mcpProbeResults = useHermesInventoryStore((s) => s.mcpProbeResults);
  const mcpProbing = useHermesInventoryStore((s) => s.mcpProbing);
  const configuringToolset = useHermesInventoryStore((s) => s.configuringToolset);
  const skillAction = useHermesInventoryStore((s) => s.skillAction);
  const skillActionLoading = useHermesInventoryStore((s) => s.skillActionLoading);
  const inventoryLoading = useHermesInventoryStore((s) => s.loading);
  const inventoryError = useHermesInventoryStore((s) => s.error);
  const loadInventory = useHermesInventoryStore((s) => s.loadInventory);
  const testMcpServer = useHermesInventoryStore((s) => s.testMcpServer);
  const configureToolset = useHermesInventoryStore((s) => s.configureToolset);
  const checkSkills = useHermesInventoryStore((s) => s.checkSkills);
  const updateSkills = useHermesInventoryStore((s) => s.updateSkills);
  const installSkill = useHermesInventoryStore((s) => s.installSkill);
  const clearInventoryError = useHermesInventoryStore((s) => s.clearError);
  const label = useThemeStore((s) => s.label);
  const openNewRun = useUiStore((s) => s.openNewRun);

  const [selectedPackId, setSelectedPackId] = React.useState<string | null>(null);
  const [installPath, setInstallPath] = React.useState("");
  const [showInstall, setShowInstall] = React.useState(false);
  const [tab, setTab] = React.useState<CatalogTab>("overview");
  const [skillQuery, setSkillQuery] = React.useState("");
  const [skillCategory, setSkillCategory] = React.useState("all");
  const [recipeSkillIds, setRecipeSkillIds] = React.useState<string[]>([]);
  const [recipeToolsetIds, setRecipeToolsetIds] = React.useState<string[]>([]);

  const selectedPack = packs.find((p) => p.id === selectedPackId) ?? null;
  const selectedRecipeSkills = skills.filter((skill) => recipeSkillIds.includes(skill.id));
  const selectedRecipeToolsets = toolsets.filter((toolset) => recipeToolsetIds.includes(toolset.id));

  React.useEffect(() => {
    loadPacks();
    loadInventory();
  }, [loadInventory, loadPacks]);

  async function handleInstall() {
    if (!installPath.trim()) return;
    await installPack(installPath.trim());
    setInstallPath("");
    setShowInstall(false);
  }

  async function handleToggle(pack: ToolPackInfo) {
    if (pack.enabled) {
      await disablePack(pack.id);
    } else {
      await enablePack(pack.id);
    }
  }

  return (
    <div className="extensions-panel">
      <div className="extensions-header">
        <div>
          <div className="workbench-eyebrow">Local Hermes</div>
          <h2>{label("extensions")}</h2>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            void loadInventory();
            void loadPacks();
          }}
          aria-label="Refresh Hermes inventory"
        >
          Refresh
        </button>
      </div>

      <div className="catalog-tabs" role="tablist" aria-label="Hermes catalog sections">
        {([
          ["overview", "Overview"],
          ["skills", `Skills ${skills.length}`],
          ["mcp", `MCP ${mcpServers.length}`],
          ["packs", `Studio Packs ${packs.length}`],
        ] as const).map(([id, text]) => (
          <button
            key={id}
            className={`catalog-tab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
            role="tab"
            aria-selected={tab === id}
          >
            {text}
          </button>
        ))}
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <button className="retry-button" onClick={clearError}>Dismiss</button>
        </div>
      )}

      {inventoryError && (
        <div className="inline-error" role="alert">
          <span>{inventoryError}</span>
          <button className="retry-button" onClick={clearInventoryError}>Dismiss</button>
        </div>
      )}

      {tab === "overview" && (
        <>
          <HermesOverview
            loading={inventoryLoading}
            summary={inventorySummary}
            providers={providers}
            models={models}
            skills={skills}
            mcpServers={mcpServers}
            toolsets={toolsets}
            fallbackProviders={fallbackProviders}
          />
          <CapabilityRecipeBuilder
            skills={skills}
            toolsets={toolsets}
            selectedSkillIds={recipeSkillIds}
            selectedToolsetIds={recipeToolsetIds}
            onToggleSkill={(skillId) => {
              setRecipeSkillIds((current) => current.includes(skillId)
                ? current.filter((item) => item !== skillId)
                : [...current, skillId].slice(-8));
            }}
            onToggleToolset={(toolsetId) => {
              setRecipeToolsetIds((current) => current.includes(toolsetId)
                ? current.filter((item) => item !== toolsetId)
                : [...current, toolsetId].slice(-12));
            }}
            onRun={() => openNewRun({
              mode: "task",
              prompt: [
                "Use this Hermes Capability Recipe for the next local production run.",
                selectedRecipeSkills.length
                  ? `Skills: ${selectedRecipeSkills.map((skill) => skill.cli_name || skill.name || skill.id).join(", ")}`
                  : "",
                selectedRecipeToolsets.length
                  ? `Toolsets: ${selectedRecipeToolsets.map((toolset) => toolset.id).join(", ")}`
                  : "",
                "Inspect the local workspace first, use the selected Hermes capabilities deliberately, keep checkpoint history enabled, and return implementation results plus verification evidence.",
              ].filter(Boolean).join("\n\n"),
              skills: selectedRecipeSkills.map((skill) => skill.cli_name || skill.name || skill.id),
              toolsets: selectedRecipeToolsets.map((toolset) => toolset.id),
              checkpoints: true,
              maxTurns: 120,
            })}
          />
        </>
      )}

      {tab === "skills" && (
        <SkillsCatalog
          skills={skills}
          query={skillQuery}
          category={skillCategory}
          onQueryChange={setSkillQuery}
          onCategoryChange={setSkillCategory}
          loading={inventoryLoading}
          actionResult={skillAction}
          actionLoading={skillActionLoading}
          onCheckSkills={(name) => void checkSkills(name)}
          onUpdateSkills={(name) => void updateSkills(name)}
          onInstallSkill={(input) => void installSkill(input)}
          onRunWithSkill={(skill) => openNewRun({
            mode: "task",
            prompt: `Use the ${skill.name} Hermes skill in this workspace. Inspect the relevant files first, then complete the requested work with verification.`,
            skills: [skill.cli_name || skill.name || skill.id],
            toolsets: ["file", "terminal", "code_execution", "skills"],
            checkpoints: true,
            maxTurns: 90,
          })}
        />
      )}

      {tab === "mcp" && (
        <McpCatalog
          servers={mcpServers}
          toolsets={toolsets}
          loading={inventoryLoading}
          probeResults={mcpProbeResults}
          probing={mcpProbing}
          configuringToolset={configuringToolset}
          onTestServer={(serverId) => void testMcpServer(serverId)}
          onConfigureToolset={(toolset) => void configureToolset({
            id: toolset.id,
            platform: toolset.platform,
            enabled: !toolset.enabled,
          })}
          onRunWithToolset={(toolsetId) => openNewRun({
            mode: "task",
            prompt: `Use the ${toolsetId} Hermes toolset while working in this local workspace. Gather context, execute the requested task, and return concrete results.`,
            toolsets: [toolsetId],
            checkpoints: true,
            maxTurns: 90,
          })}
        />
      )}

      {tab === "packs" && (
        <>
          <div className="extensions-subheader">
            <span>Studio tool packs</span>
            <button
              className="tool-button"
              onClick={() => setShowInstall(!showInstall)}
              aria-label="Install tool pack"
            >
              {showInstall ? "Cancel" : "Install Pack"}
            </button>
          </div>

          {showInstall && (
            <div className="install-form">
              <input
                type="text"
                className="composer-input"
                placeholder="Path to manifest.json or pack directory"
                value={installPath}
                onChange={(e) => setInstallPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInstall()}
                aria-label="Pack path"
              />
              <button
                className="primary-button"
                onClick={handleInstall}
                disabled={!installPath.trim()}
              >
                Install
              </button>
            </div>
          )}

          {loading && packs.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-text">Loading extensions...</div>
            </div>
          )}

          {!loading && packs.length === 0 && (
            <EmptyState
              icon={Package}
              title="No extensions"
              description="Install a tool pack to add custom commands and integrations to Studio."
              action={{
                label: "Install Pack",
                onClick: () => setShowInstall(true),
              }}
            />
          )}

          <div className="pack-list">
            {packs.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                isSelected={selectedPackId === pack.id}
                onSelect={() => setSelectedPackId(selectedPackId === pack.id ? null : pack.id)}
                onToggle={() => handleToggle(pack)}
              />
            ))}
          </div>
        </>
      )}

      {selectedPack && (
        <PackDetails
          pack={selectedPack}
          onClose={() => setSelectedPackId(null)}
          onToggle={() => handleToggle(selectedPack)}
        />
      )}
    </div>
  );
}

function HermesOverview({
  loading,
  summary,
  providers,
  models,
  skills,
  mcpServers,
  toolsets,
  fallbackProviders,
}: {
  loading: boolean;
  summary: ReturnType<typeof useHermesInventoryStore.getState>["summary"];
  providers: ReturnType<typeof useHermesInventoryStore.getState>["providers"];
  models: ReturnType<typeof useHermesInventoryStore.getState>["models"];
  skills: ReturnType<typeof useHermesInventoryStore.getState>["skills"];
  mcpServers: ReturnType<typeof useHermesInventoryStore.getState>["mcpServers"];
  toolsets: ReturnType<typeof useHermesInventoryStore.getState>["toolsets"];
  fallbackProviders: ReturnType<typeof useHermesInventoryStore.getState>["fallbackProviders"];
}) {
  const activeProviders = providers.filter((provider) => provider.configured || provider.active);
  const topProviders = [...activeProviders, ...providers.filter((provider) => !provider.configured && !provider.active)].slice(0, 10);
  const featuredSkills = skills.filter((skill) => skill.installed).slice(0, 8);

  if (loading && !summary) {
    return <div className="empty-state"><div className="empty-state-text">Reading local Hermes inventory...</div></div>;
  }

  return (
    <div className="hermes-inventory">
      <div className="inventory-hero">
        <div>
          <div className="workbench-eyebrow">Detected from ~/.hermes</div>
          <h3>{summary?.active_provider ?? "Hermes"} / {summary?.active_model ?? "model catalog"}</h3>
          <p>{summary?.hermes_home ?? "Local Hermes home not found"}</p>
        </div>
        <div className="inventory-scoreboard">
          <Metric value={summary?.provider_count ?? providers.length} label="providers" />
          <Metric value={summary?.model_count ?? models.length} label="models" />
          <Metric value={summary?.installed_skill_count ?? skills.filter((s) => s.installed).length} label="skills" />
          <Metric value={summary?.mcp_server_count ?? mcpServers.length} label="MCP" />
          <Metric value={summary?.fallback_provider_count ?? fallbackProviders.length} label="fallbacks" />
        </div>
      </div>

      <div className="inventory-section">
        <div className="inventory-section-title">Provider matrix</div>
        <div className="provider-matrix">
          {topProviders.map((provider) => (
            <div key={provider.id} className={`provider-tile ${provider.active ? "active" : ""}`}>
              <div className="provider-tile-name">{provider.name}</div>
              <div className="provider-tile-meta">
                <span>{provider.model_count.toLocaleString()} models</span>
                {provider.configured && <span>configured</span>}
                {provider.active && <span>active</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="inventory-section">
        <div className="inventory-section-title">Fallback provider chain</div>
        {fallbackProviders.length > 0 ? (
          <div className="fallback-chain">
            {fallbackProviders.map((fallback) => (
              <div key={`${fallback.index}:${fallback.provider}:${fallback.model ?? ""}`} className="fallback-step">
                <span>{fallback.index + 1}</span>
                <div>
                  <strong>{fallback.provider_name || fallback.provider}</strong>
                  <small>
                    {fallback.model || "default model"}
                    {fallback.configured ? " · configured" : " · missing credentials"}
                    {fallback.active ? " · active primary" : ""}
                  </small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-note">
            No fallback providers configured. Studio can read the chain now; add entries through Hermes fallback setup until a safe non-interactive write path is available.
          </div>
        )}
      </div>

      <div className="inventory-section">
        <div className="inventory-section-title">Installed skill surface</div>
        <div className="skill-mini-grid">
          {featuredSkills.map((skill) => (
            <div key={skill.id} className="skill-mini-card">
              <span>{skill.category}</span>
              <strong>{skill.name}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="inventory-section">
        <div className="inventory-section-title">Tool access</div>
        <div className="mcp-server-list compact">
          {mcpServers.slice(0, 8).map((server) => (
            <div key={server.id} className="mcp-server-row">
              <span className={`mini-status ${server.enabled ? "status-running" : "status-stopped"}`} />
              <span>{server.id}</span>
              <code>{String(server.command ?? "configured")}</code>
            </div>
          ))}
          {mcpServers.length === 0 && <div className="panel-note">No MCP servers configured in Hermes.</div>}
        </div>
        <div className="toolset-strip">
          {toolsets.slice(0, 18).map((toolset) => (
            <span key={`${toolset.platform}:${toolset.id}`} className="toolset-pill">{toolset.platform}:{toolset.id}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="inventory-metric">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}

function CapabilityRecipeBuilder({
  skills,
  toolsets,
  selectedSkillIds,
  selectedToolsetIds,
  onToggleSkill,
  onToggleToolset,
  onRun,
}: {
  skills: HermesSkill[];
  toolsets: ReturnType<typeof useHermesInventoryStore.getState>["toolsets"];
  selectedSkillIds: string[];
  selectedToolsetIds: string[];
  onToggleSkill: (skillId: string) => void;
  onToggleToolset: (toolsetId: string) => void;
  onRun: () => void;
}) {
  const installedSkills = skills.filter((skill) => skill.installed).slice(0, 24);
  const enabledToolsets = toolsets.filter((toolset) => toolset.enabled).slice(0, 32);
  const hasSelection = selectedSkillIds.length > 0 || selectedToolsetIds.length > 0;

  return (
    <div className="capability-recipe">
      <div className="artifact-section-header">
        <div>
          <div className="inventory-section-title">Capability Recipe</div>
          <span>{selectedSkillIds.length} skills · {selectedToolsetIds.length} toolsets selected for a local Hermes run</span>
        </div>
        <button className="primary-button" type="button" disabled={!hasSelection} onClick={onRun}>
          Launch Recipe
        </button>
      </div>
      <div className="capability-recipe-columns">
        <div>
          <div className="pane-label">Skills</div>
          <div className="capability-pill-grid">
            {installedSkills.map((skill) => (
              <button
                key={skill.id}
                className={`capability-pill ${selectedSkillIds.includes(skill.id) ? "active" : ""}`}
                type="button"
                title={skill.description || skill.title}
                onClick={() => onToggleSkill(skill.id)}
              >
                <span>{skill.category}</span>
                <strong>{skill.name}</strong>
              </button>
            ))}
            {installedSkills.length === 0 && <div className="panel-note">No installed Hermes skills detected.</div>}
          </div>
        </div>
        <div>
          <div className="pane-label">Toolsets and MCP</div>
          <div className="capability-pill-grid">
            {enabledToolsets.map((toolset) => (
              <button
                key={`${toolset.platform}:${toolset.id}`}
                className={`capability-pill compact ${selectedToolsetIds.includes(toolset.id) ? "active" : ""}`}
                type="button"
                title={toolset.label || toolset.source}
                onClick={() => onToggleToolset(toolset.id)}
              >
                <span>{toolset.platform}</span>
                <strong>{toolset.id}</strong>
              </button>
            ))}
            {enabledToolsets.length === 0 && <div className="panel-note">No enabled Hermes toolsets detected.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillsCatalog({
  skills,
  query,
  category,
  onQueryChange,
  onCategoryChange,
  loading,
  actionResult,
  actionLoading,
  onCheckSkills,
  onUpdateSkills,
  onInstallSkill,
  onRunWithSkill,
}: {
  skills: HermesSkill[];
  query: string;
  category: string;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  loading: boolean;
  actionResult: ReturnType<typeof useHermesInventoryStore.getState>["skillAction"];
  actionLoading: boolean;
  onCheckSkills: (name?: string) => void;
  onUpdateSkills: (name?: string) => void;
  onInstallSkill: (input: { identifier: string; category?: string; name?: string; force?: boolean }) => void;
  onRunWithSkill: (skill: HermesSkill) => void;
}) {
  const [installIdentifier, setInstallIdentifier] = React.useState("");
  const [installCategory, setInstallCategory] = React.useState("");
  const [installName, setInstallName] = React.useState("");
  const [installForce, setInstallForce] = React.useState(false);
  const categories = ["all", ...Array.from(new Set(skills.map((skill) => skill.category))).sort()];
  const filtered = skills.filter((skill) => {
    const matchesCategory = category === "all" || skill.category === category;
    const haystack = `${skill.name} ${skill.title} ${skill.description} ${skill.tags.join(" ")}`.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  });
  const canInstall = installIdentifier.trim().length > 0;

  return (
    <div className="skills-catalog">
      <div className="catalog-toolbar">
        <input
          className="studio-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search Hermes skills"
          aria-label="Search Hermes skills"
        />
        <select
          className="studio-select"
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
          aria-label="Filter skills by category"
        >
          {categories.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>
      <div className="skill-action-panel">
        <div className="skill-action-row">
          <button className="tool-button" type="button" disabled={actionLoading} onClick={() => onCheckSkills()}>
            Check
          </button>
          <button className="tool-button" type="button" disabled={actionLoading} onClick={() => onUpdateSkills()}>
            Update
          </button>
          <input
            className="studio-input"
            value={installIdentifier}
            onChange={(event) => setInstallIdentifier(event.target.value)}
            placeholder="Skill identifier or SKILL.md URL"
            aria-label="Hermes skill identifier"
          />
          <input
            className="studio-input compact"
            value={installCategory}
            onChange={(event) => setInstallCategory(event.target.value)}
            placeholder="Category"
            aria-label="Install skill category"
          />
          <input
            className="studio-input compact"
            value={installName}
            onChange={(event) => setInstallName(event.target.value)}
            placeholder="Name"
            aria-label="Install skill name"
          />
          <label className="inline-check">
            <input type="checkbox" checked={installForce} onChange={(event) => setInstallForce(event.target.checked)} />
            Force
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!canInstall || actionLoading}
            onClick={() => {
              onInstallSkill({
                identifier: installIdentifier.trim(),
                category: installCategory.trim() || undefined,
                name: installName.trim() || undefined,
                force: installForce,
              });
            }}
          >
            Install
          </button>
        </div>
        {actionResult && (
          <div className={`skill-action-result ${actionResult.ok ? "ok" : "error"}`}>
            <strong>{actionResult.action}</strong>
            <span>{actionResult.message || (actionResult.ok ? "completed" : actionResult.error ?? "failed")}</span>
            <small>{actionResult.duration_ms.toLocaleString()} ms</small>
          </div>
        )}
      </div>
      {loading && skills.length === 0 && <div className="empty-state"><div className="empty-state-text">Reading skills...</div></div>}
      <div className="skill-catalog-grid">
        {filtered.map((skill) => (
          <div key={skill.id} className={`skill-card ${skill.installed ? "installed" : ""}`}>
            <div className="skill-card-top">
              <span>{skill.category}</span>
              <span>{skill.source}</span>
            </div>
            <h3>{skill.name}</h3>
            <p>{skill.description || skill.title}</p>
            {skill.tags.length > 0 && (
              <div className="skill-tags">
                {skill.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            )}
            <code>{skill.id}</code>
            <div className="skill-card-actions">
              <button className="tool-button" type="button" onClick={() => onRunWithSkill(skill)}>
                Run
              </button>
              <button className="tool-button" type="button" disabled={actionLoading} onClick={() => onCheckSkills(skill.name)}>
                Check
              </button>
              <button className="tool-button" type="button" disabled={actionLoading} onClick={() => onUpdateSkills(skill.name)}>
                Update
              </button>
            </div>
          </div>
        ))}
      </div>
      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-text">No matching Hermes skills</div>
        </div>
      )}
    </div>
  );
}

function McpCatalog({
  servers,
  toolsets,
  loading,
  probeResults,
  probing,
  configuringToolset,
  onTestServer,
  onConfigureToolset,
  onRunWithToolset,
}: {
  servers: ReturnType<typeof useHermesInventoryStore.getState>["mcpServers"];
  toolsets: ReturnType<typeof useHermesInventoryStore.getState>["toolsets"];
  loading: boolean;
  probeResults: ReturnType<typeof useHermesInventoryStore.getState>["mcpProbeResults"];
  probing: ReturnType<typeof useHermesInventoryStore.getState>["mcpProbing"];
  configuringToolset: ReturnType<typeof useHermesInventoryStore.getState>["configuringToolset"];
  onTestServer: (serverId: string) => void;
  onConfigureToolset: (toolset: ReturnType<typeof useHermesInventoryStore.getState>["toolsets"][number]) => void;
  onRunWithToolset: (toolsetId: string) => void;
}) {
  return (
    <div className="mcp-catalog">
      {loading && servers.length === 0 && <div className="empty-state"><div className="empty-state-text">Reading MCP config...</div></div>}
      <div className="mcp-server-list">
        {servers.map((server) => {
          const probe = probeResults[server.id];
          const isProbing = Boolean(probing[server.id]);
          return (
            <div key={server.id} className={`mcp-server-card ${probe ? `probe-${probe.status}` : ""}`}>
              <div>
                <h3>{server.id}</h3>
                <code>{String(server.command ?? "")} {server.args.map((arg) => String(arg)).join(" ")}</code>
                {probe && (
                  <div className="mcp-probe-result">
                    <span className={`mcp-probe-status ${probe.status}`}>{probe.ok ? "connected" : probe.status}</span>
                    <strong>{probe.message || probe.error || "MCP probe completed"}</strong>
                    <small>{probe.duration_ms.toLocaleString()} ms · exit {probe.exit_code ?? "n/a"}</small>
                  </div>
                )}
              </div>
              <div className="mcp-server-meta">
                <span>{server.enabled ? "enabled" : "disabled"}</span>
                <span>{server.env_keys.length} env</span>
                <button className="tool-button" type="button" disabled={isProbing} onClick={() => onTestServer(server.id)}>
                  {isProbing ? "Testing" : "Test"}
                </button>
                <button className="tool-button" type="button" onClick={() => onRunWithToolset(`${server.id}:*`)}>
                  Use
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!loading && servers.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-text">No MCP servers configured</div>
        </div>
      )}
      <div className="inventory-section">
        <div className="inventory-section-title">Toolsets</div>
        <div className="toolset-grid">
          {toolsets.map((toolset) => {
            const key = `${toolset.platform}:${toolset.id}`;
            const isConfiguring = Boolean(configuringToolset[key]);
            return (
              <div key={`${toolset.platform}:${toolset.kind}:${toolset.id}`} className="toolset-control">
                <button
                  className={`toolset-pill as-button ${toolset.enabled ? "enabled" : "disabled"}`}
                  type="button"
                  onClick={() => onRunWithToolset(toolset.id)}
                  title={toolset.label || toolset.source}
                >
                  {toolset.platform}:{toolset.id}
                </button>
                <button
                  className="tool-button"
                  type="button"
                  disabled={isConfiguring}
                  onClick={() => onConfigureToolset(toolset)}
                >
                  {isConfiguring ? "Saving" : toolset.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PackCard({
  pack,
  isSelected,
  onSelect,
  onToggle,
}: {
  pack: ToolPackInfo;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={`pack-card ${isSelected ? "selected" : ""} ${!pack.valid ? "invalid" : ""} ${!pack.compatible ? "incompatible" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      aria-label={`${pack.name} tool pack`}
    >
      <div className="pack-card-header">
        <div className="pack-card-info">
          <div className="pack-card-name">
            {pack.name}
            {!pack.trusted && (
              <span
                className="pack-untrusted-badge"
                title="This pack is not trusted. Commands require explicit approval."
                aria-label="Untrusted pack"
              >
                !
              </span>
            )}
          </div>
          <div className="pack-card-meta">
            {pack.author && <span>{pack.author}</span>}
            {pack.version && <span>v{pack.version}</span>}
            <span>{pack.commands.length} command{pack.commands.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <label
          className="pack-toggle"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${pack.enabled ? "Disable" : "Enable"} ${pack.name}`}
        >
          <input
            type="checkbox"
            checked={pack.enabled}
            onChange={onToggle}
            disabled={!pack.valid || !pack.compatible}
          />
          <span className="pack-toggle-slider" />
        </label>
      </div>
      {pack.description && (
        <div className="pack-card-desc">{pack.description}</div>
      )}
      {!pack.valid && pack.warnings.length > 0 && (
        <div className="pack-warnings" role="alert">
          {pack.warnings.slice(0, 2).map((w, i) => (
            <div key={i} className="pack-warning">{w}</div>
          ))}
        </div>
      )}
      {!pack.compatible && (
        <div className="pack-incompatible" role="alert">
          Not compatible with current platform
        </div>
      )}
    </div>
  );
}

function PackDetails({
  pack,
  onClose,
  onToggle,
}: {
  pack: ToolPackInfo;
  onClose: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="pack-details-overlay" onClick={onClose} role="dialog" aria-label={`${pack.name} details`}>
      <div className="pack-details" onClick={(e) => e.stopPropagation()}>
        <div className="pack-details-header">
          <div>
            <h3>{pack.name}</h3>
            <div className="pack-details-meta">
              {pack.author} &middot; v{pack.version}
            </div>
          </div>
          <div className="pack-details-actions">
            <button
              className={`tool-button ${pack.enabled ? "active" : ""}`}
              onClick={onToggle}
              disabled={!pack.valid || !pack.compatible}
            >
              {pack.enabled ? "Disable" : "Enable"}
            </button>
            <button className="tool-button" onClick={onClose} aria-label="Close details">
              &times;
            </button>
          </div>
        </div>

        {pack.description && (
          <p className="pack-details-desc">{pack.description}</p>
        )}

        {!pack.trusted && (
          <div className="pack-security-warning" role="alert">
            <strong>Security Warning:</strong> This pack is not trusted. Commands from untrusted
            packs will require explicit approval before execution. Only enable packs from sources
            you trust.
          </div>
        )}

        {pack.permissions.length > 0 && (
          <div className="pack-permissions">
            <h4>Permissions</h4>
            <div className="permission-list">
              {pack.permissions.map((perm) => (
                <span key={perm} className="permission-badge">{perm}</span>
              ))}
            </div>
          </div>
        )}

        <div className="pack-commands">
          <h4>Commands ({pack.commands.length})</h4>
          {pack.commands.map((cmd) => (
            <div key={cmd.id} className="pack-command">
              <div className="pack-command-name">{cmd.name}</div>
              {cmd.description && (
                <div className="pack-command-desc">{cmd.description}</div>
              )}
              <code className="pack-command-code">{cmd.command}</code>
              {cmd.args && cmd.args.length > 0 && (
                <div className="pack-command-args">
                  <span className="pack-command-args-label">Args:</span>
                  {cmd.args.map((arg) => (
                    <span key={arg.name} className="pack-command-arg">
                      {arg.required ? arg.name : `[${arg.name}]`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {pack.compat?.platform && pack.compat.platform.length > 0 && (
          <div className="pack-compat">
            <h4>Platform</h4>
            <div className="platform-list">
              {pack.compat.platform.map((p) => (
                <span key={p} className="platform-badge">{p}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
