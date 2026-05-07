import React from "react";
import { useToolPackStore } from "../../stores/toolPackStore";
import { useThemeStore } from "../../stores/themeStore";
import type { ToolPackInfo } from "../../api/studioClient";

export function ExtensionsPanel() {
  const packs = useToolPackStore((s) => s.packs);
  const loading = useToolPackStore((s) => s.loading);
  const error = useToolPackStore((s) => s.error);
  const loadPacks = useToolPackStore((s) => s.loadPacks);
  const enablePack = useToolPackStore((s) => s.enablePack);
  const disablePack = useToolPackStore((s) => s.disablePack);
  const installPack = useToolPackStore((s) => s.installPack);
  const clearError = useToolPackStore((s) => s.clearError);
  const label = useThemeStore((s) => s.label);

  const [selectedPackId, setSelectedPackId] = React.useState<string | null>(null);
  const [installPath, setInstallPath] = React.useState("");
  const [showInstall, setShowInstall] = React.useState(false);

  const selectedPack = packs.find((p) => p.id === selectedPackId) ?? null;

  React.useEffect(() => {
    loadPacks();
  }, [loadPacks]);

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
        <h2>{label("extensions")}</h2>
        <button
          className="primary-button"
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

      {error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <button className="retry-button" onClick={clearError}>Dismiss</button>
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
            Install a tool pack to add custom commands to your Studio.
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
