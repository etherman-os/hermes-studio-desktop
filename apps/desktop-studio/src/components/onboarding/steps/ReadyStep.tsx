import React from "react";
import type { WizardConfig } from "../FirstRunWizard";

interface ReadyStepProps {
  config: WizardConfig;
  onNext: (updates?: Partial<WizardConfig>) => void;
  onBack: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const MODE_LABELS = {
  local: "Local CLI",
  gateway: "Gateway / API",
  mock: "Mock Mode",
};

export function ReadyStep({ config, onNext, onBack }: ReadyStepProps) {
  return (
    <div className="step-ready">
      <div className="ready-icon">🚀</div>
      <h2 className="step-title">You're All Set!</h2>
      <p className="step-description">
        Here's what we've configured for your workspace:
      </p>

      <div className="config-summary">
        <div className="summary-item">
          <span className="summary-icon">🤖</span>
          <div className="summary-content">
            <strong>Hermes Agent</strong>
            <span>
              {config.hermesFound
                ? `Connected (${config.hermesVersion ?? "Active"})`
                : "Not configured — use Settings to connect later"}
            </span>
          </div>
          <span className={`status-badge ${config.hermesFound ? "ok" : "muted"}`}>
            {config.hermesFound ? "✓" : "—"}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-icon">📁</span>
          <div className="summary-content">
            <strong>Workspace</strong>
            <span>
              {config.workspace
                ? config.workspace
                : "No workspace selected — you can set this later"}
            </span>
          </div>
          <span className={`status-badge ${config.workspace ? "ok" : "muted"}`}>
            {config.workspace ? "✓" : "—"}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-icon">🎨</span>
          <div className="summary-content">
            <strong>Theme</strong>
            <span>{config.themeId}</span>
          </div>
          <span className="status-badge ok">✓</span>
        </div>

        <div className="summary-item">
          <span className="summary-icon">⚙️</span>
          <div className="summary-content">
            <strong>Backend Mode</strong>
            <span>{MODE_LABELS[config.backendMode]}</span>
          </div>
          <span className="status-badge ok">✓</span>
        </div>
      </div>

      <p className="ready-note">
        You can change any of these settings later in the Studio preferences.
      </p>

      <div className="step-actions">
        <button className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button className="btn-primary launch" onClick={() => onNext()}>
          Launch Studio
        </button>
      </div>

      <style>{`
        .step-ready {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          max-width: 480px;
          width: 100%;
        }

        .ready-icon {
          font-size: 56px;
          margin-bottom: 8px;
        }

        .step-title {
          font-size: 26px;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .step-description {
          font-size: 14px;
          color: var(--app-text-secondary, #8b949e);
          margin: 0;
        }

        .config-summary {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }

        .summary-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: var(--app-surface, #161b22);
          border: 1px solid var(--app-border, #30363d);
          border-radius: 8px;
        }

        .summary-icon {
          font-size: 20px;
        }

        .summary-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .summary-content strong {
          font-size: 13px;
          font-weight: 600;
        }

        .summary-content span {
          font-size: 12px;
          color: var(--app-text-secondary, #8b949e);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .status-badge {
          font-size: 16px;
        }

        .status-badge.ok {
          color: var(--app-ok, #3fb950);
        }

        .status-badge.muted {
          color: var(--app-text-muted, #6e7681);
        }

        .ready-note {
          font-size: 12px;
          color: var(--app-text-muted, #6e7681);
          margin: 0;
          text-align: center;
        }

        .step-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin-top: 8px;
        }

        .btn-primary {
          padding: 10px 28px;
          background: var(--app-accent, #58a6ff);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s;
        }

        .btn-primary:hover {
          opacity: 0.85;
        }

        .btn-primary.launch {
          background: var(--app-ok, #3fb950);
          padding: 12px 36px;
          font-size: 15px;
        }

        .btn-primary.launch:hover {
          opacity: 0.9;
        }

        .btn-secondary {
          padding: 10px 20px;
          background: transparent;
          color: var(--app-text-secondary, #8b949e);
          border: 1px solid var(--app-border, #30363d);
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: border-color 0.15s;
        }

        .btn-secondary:hover {
          border-color: var(--app-text-secondary, #8b949e);
        }
      `}</style>
    </div>
  );
}