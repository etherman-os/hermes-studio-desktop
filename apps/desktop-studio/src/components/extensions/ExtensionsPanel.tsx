import React from "react";
import { useToolPackStore } from "../../stores/toolPackStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
import { useThemeStore } from "../../stores/themeStore";
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
  const inventoryLoading = useHermesInventoryStore((s) => s.loading);
  const inventoryError = useHermesInventoryStore((s) => s.error);
  const loadInventory = useHermesInventoryStore((s) => s.loadInventory);
  const clearInventoryError = useHermesInventoryStore((s) => s.clearError);
  const label = useThemeStore((s) => s.label);

  const [selectedPackId, setSelectedPackId] = React.useState<string | null>(null);
  const [installPath, setInstallPath] = React.useState("");
  const [showInstall, setShowInstall] = React.useState(false);
  const [tab, setTab] = React.useState<CatalogTab>("overview");
  const [skillQuery, setSkillQuery] = React.useState("");
  const [skillCategory, setSkillCategory] = React.useState("all");

  const selectedPack = packs.find((p) => p.id === selectedPackId) ?? null;

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
        <HermesOverview
          loading={inventoryLoading}
          summary={inventorySummary}
          providers={providers}
          models={models}
          skills={skills}
          mcpServers={mcpServers}
          toolsets={toolsets}
        />
      )}

      {tab === "skills" && (
        <SkillsCatalog
          skills={skills}
          query={skillQuery}
          category={skillCategory}
          onQueryChange={setSkillQuery}
          onCategoryChange={setSkillCategory}
          loading={inventoryLoading}
        />
      )}

      {tab === "mcp" && (
        <McpCatalog servers={mcpServers} toolsets={toolsets} loading={inventoryLoading} />
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
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">E</div>
              <div className="empty-state-text">No tool packs installed</div>
              <div className="empty-state-description">
                Install a tool pack to add custom Studio commands.
              </div>
            </div>
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
}: {
  loading: boolean;
  summary: ReturnType<typeof useHermesInventoryStore.getState>["summary"];
  providers: ReturnType<typeof useHermesInventoryStore.getState>["providers"];
  models: ReturnType<typeof useHermesInventoryStore.getState>["models"];
  skills: ReturnType<typeof useHermesInventoryStore.getState>["skills"];
  mcpServers: ReturnType<typeof useHermesInventoryStore.getState>["mcpServers"];
  toolsets: ReturnType<typeof useHermesInventoryStore.getState>["toolsets"];
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

function SkillsCatalog({
  skills,
  query,
  category,
  onQueryChange,
  onCategoryChange,
  loading,
}: {
  skills: HermesSkill[];
  query: string;
  category: string;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  loading: boolean;
}) {
  const categories = ["all", ...Array.from(new Set(skills.map((skill) => skill.category))).sort()];
  const filtered = skills.filter((skill) => {
    const matchesCategory = category === "all" || skill.category === category;
    const haystack = `${skill.name} ${skill.title} ${skill.description} ${skill.tags.join(" ")}`.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  });

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
}: {
  servers: ReturnType<typeof useHermesInventoryStore.getState>["mcpServers"];
  toolsets: ReturnType<typeof useHermesInventoryStore.getState>["toolsets"];
  loading: boolean;
}) {
  return (
    <div className="mcp-catalog">
      {loading && servers.length === 0 && <div className="empty-state"><div className="empty-state-text">Reading MCP config...</div></div>}
      <div className="mcp-server-list">
        {servers.map((server) => (
          <div key={server.id} className="mcp-server-card">
            <div>
              <h3>{server.id}</h3>
              <code>{String(server.command ?? "")} {server.args.map((arg) => String(arg)).join(" ")}</code>
            </div>
            <div className="mcp-server-meta">
              <span>{server.enabled ? "enabled" : "disabled"}</span>
              <span>{server.env_keys.length} env</span>
            </div>
          </div>
        ))}
      </div>
      {!loading && servers.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-text">No MCP servers configured</div>
        </div>
      )}
      <div className="inventory-section">
        <div className="inventory-section-title">Toolsets</div>
        <div className="toolset-grid">
          {toolsets.map((toolset) => (
            <span key={`${toolset.platform}:${toolset.kind}:${toolset.id}`} className="toolset-pill">
              {toolset.platform}:{toolset.id}
            </span>
          ))}
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
