import React from "react";
import { useProfileStore } from "../../stores/profileStore";
import { useAdapterStore } from "../../stores/adapterStore";
import { useHermesInventoryStore } from "../../stores/hermesInventoryStore";
import { useThemeStore } from "../../stores/themeStore";

export function ProfilesSurface() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const profileCount = useProfileStore((s) => s.profileCount);
  const loaded = useProfileStore((s) => s.loaded);
  const error = useProfileStore((s) => s.error);
  const activatingProfileId = useProfileStore((s) => s.activatingProfileId);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);
  const activateProfile = useProfileStore((s) => s.activateProfile);
  const activateError = useProfileStore((s) => s.activateError);

  const connected = useAdapterStore((s) => s.connected);
  const activeBackend = useAdapterStore((s) => s.activeBackend);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const hermesConnected = useAdapterStore((s) => s.hermesConnected);

  const cliStatus = useHermesInventoryStore((s) => s.cliStatus);
  const inventorySummary = useHermesInventoryStore((s) => s.summary);
  const label = useThemeStore((s) => s.label);

  const [confirmActivate, setConfirmActivate] = React.useState<string | null>(null);

  React.useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  function handleActivateClick(profileId: string) {
    if (profileId === activeProfile?.id) return;
    if (confirmActivate === profileId) {
      void activateProfile(profileId);
      setConfirmActivate(null);
    } else {
      setConfirmActivate(profileId);
    }
  }

  const mockActive = backendMode === "mock" || activeBackend === "mock";

  return (
    <div className="profiles-surface" data-testid="profiles-surface">
      <div className="profiles-header" data-testid="profiles-header">
        <div>
          <div className="workbench-eyebrow">MANAGE mode</div>
          <h2>Profiles</h2>
        </div>
        <button
          className="tool-button"
          onClick={() => void loadProfiles()}
          disabled={!connected}
          aria-label="Refresh profiles"
        >
          Refresh
        </button>
      </div>

      {/* Active profile hero */}
      <section className="profile-hero">
        <div className="profile-avatar-placeholder" aria-hidden="true">
          {activeProfile?.name ? activeProfile.name.charAt(0).toUpperCase() : "?"}
        </div>
        <div className="profile-hero-info">
          <h3>{activeProfile?.name ?? "No active profile"}</h3>
          {activeProfile && (
            <div className="profile-hero-meta">
              <span className="profile-badge active">Active</span>
              {activeProfile.has_config && <span className="profile-badge">Config</span>}
              {activeProfile.has_state_db && <span className="profile-badge">State DB</span>}
              <span>{activeProfile.session_count} session{activeProfile.session_count !== 1 ? "s" : ""}</span>
            </div>
          )}
          {activeProfile?.path && (
            <code className="profile-path">{activeProfile.path}</code>
          )}
        </div>
        {activeProfile && (
          <div className="profile-hero-actions">
            <button
              className="tool-button"
              aria-label="Manage connected accounts"
              disabled
              title="Accounts panel coming soon"
            >
              Manage Accounts
            </button>
          </div>
        )}
      </section>

      {/* Connection status strip */}
      <section className="profile-connection-strip">
        <div className="connection-status-row">
          <span className={`status-dot status-${connected ? "ok" : "danger"}`} />
          <span>Adapter {connected ? "connected" : "disconnected"}</span>
        </div>
        <div className="connection-status-row">
          <span className={`status-dot status-${hermesConnected ? "ok" : "neutral"}`} />
          <span>Hermes CLI {cliStatus?.available ? `v${cliStatus.version}` : cliStatus?.available === false ? "unavailable" : "checking"}</span>
        </div>
        <div className="connection-status-row">
          <span className={`status-dot status-${mockActive ? "warn" : "ok"}`} />
          <span>{mockActive ? "Studio simulation" : `${activeBackend || "unknown"} backend`}</span>
        </div>
        {inventorySummary?.hermes_home && (
          <div className="connection-status-row hermes-home">
            <code>{inventorySummary.hermes_home}</code>
          </div>
        )}
      </section>

      {/* Error display */}
      {(error || activateError) && (
        <div className="inline-error" role="alert">
          <span>{activateError ?? error}</span>
        </div>
      )}

      {/* Profile list */}
      <section className="profile-list-section">
        <div className="inventory-section-title">
          Available Profiles
          <span className="section-count">{profileCount}</span>
        </div>

        {!loaded && profiles.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-text">Loading profiles...</div>
          </div>
        )}

        {loaded && profiles.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">P</div>
            <div className="empty-state-text">No profiles found</div>
            <div className="empty-state-description">
              Profiles are created by Hermes Agent. Start the adapter to load them.
            </div>
          </div>
        )}

        <div className="profile-list">
          {profiles.map((profile) => {
            const isActivating = activatingProfileId === profile.id;
            const isConfirming = confirmActivate === profile.id;
            const isActive = profile.active;

            return (
              <div key={profile.id} className={`profile-card ${isActive ? "active" : ""}`} data-testid={`profile-card-${profile.id}`}>
                <div className="profile-card-avatar" aria-hidden="true">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <div className="profile-card-info">
                  <div className="profile-card-name">{profile.name}</div>
                  <code className="profile-card-path">{profile.path}</code>
                  <div className="profile-card-meta">
                    {profile.has_config && <span className="meta-tag">config</span>}
                    {profile.has_state_db && <span className="meta-tag">state</span>}
                    <span>{profile.session_count} session{profile.session_count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="profile-card-actions">
                  {isActive ? (
                    <span className="profile-badge active">Active</span>
                  ) : (
                    <button
                      className={`tool-button ${isConfirming ? "danger" : ""}`}
                      disabled={isActivating || !connected}
                      onClick={() => handleActivateClick(profile.id)}
                      aria-label={`Activate profile ${profile.name}`}
                    >
                      {isActivating ? "Switching..." : isConfirming ? "Confirm?" : "Activate"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Connected accounts */}
      <section className="profile-accounts-section">
        <div className="inventory-section-title">Connected Accounts</div>
        <div className="accounts-list">
          <div className="account-row">
            <span className="account-provider">Hermes Agent</span>
            <span className={`status-dot status-${connected ? "ok" : "danger"}`} />
            <span>{connected ? "Connected" : "Offline"}</span>
            {activeBackend && <code className="account-backend">{activeBackend}</code>}
          </div>
          <div className="account-row">
            <span className="account-provider">Studio Adapter</span>
            <span className={`status-dot status-${connected ? "ok" : "neutral"}`} />
            <span>{connected ? "Ready" : "Unavailable"}</span>
            <code className="account-backend">127.0.0.1:39191</code>
          </div>
          {cliStatus?.version && (
            <div className="account-row">
              <span className="account-provider">Hermes CLI</span>
              <span className={`status-dot status-${cliStatus.available ? "ok" : "warn"}`} />
              <span>v{cliStatus.version}</span>
              {cliStatus.transport && <code className="account-backend">{cliStatus.transport}</code>}
            </div>
          )}
        </div>
        {!connected && (
          <div className="panel-note">
            Adapter disconnected. Start the adapter to manage profiles and sessions.
          </div>
        )}
      </section>

      {/* Quick stats */}
      <section className="profile-stats-section">
        <div className="inventory-section-title">Session Overview</div>
        <div className="profile-stats-grid">
          <div className="profile-stat">
            <strong>{profileCount}</strong>
            <span>Total Profiles</span>
          </div>
          <div className="profile-stat">
            <strong>{profiles.filter((p) => p.has_state_db).length}</strong>
            <span>With State DB</span>
          </div>
          <div className="profile-stat">
            <strong>{profiles.reduce((sum, p) => sum + p.session_count, 0)}</strong>
            <span>Total Sessions</span>
          </div>
          <div className="profile-stat">
            <strong>{inventorySummary?.installed_skill_count ?? "—"}</strong>
            <span>Hermes Skills</span>
          </div>
        </div>
      </section>
    </div>
  );
}

