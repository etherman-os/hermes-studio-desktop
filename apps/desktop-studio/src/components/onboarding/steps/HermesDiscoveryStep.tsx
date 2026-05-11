import React from "react";
import { useAdapterStore } from "../../../stores/adapterStore";
import type { WizardConfig } from "../FirstRunWizard";

interface HermesDiscoveryStepProps {
  config: WizardConfig;
  onNext: (updates?: Partial<WizardConfig>) => void;
  onBack: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function HermesDiscoveryStep({ config, onNext, onBack }: HermesDiscoveryStepProps) {
  const hermesConnected = useAdapterStore((s) => s.hermesConnected);
  const hermesUrl = useAdapterStore((s) => s.hermesUrl);
  const backendMode = useAdapterStore((s) => s.backendMode);
  const [checking, setChecking] = React.useState(true);
  const [skipped, setSkipped] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setChecking(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleNext = () => {
    onNext({
      hermesFound: hermesConnected,
      hermesVersion: hermesConnected ? backendMode : null,
    });
  };

  const handleSkip = () => {
    setSkipped(true);
    onNext({ hermesFound: false, hermesVersion: null });
  };

  return (
    <div className="step-hermes-discovery">
      <h2 className="step-title">Hermes Agent Discovery</h2>
      <p className="step-description">
        Checking for a local Hermes Agent installation...
      </p>

      <div className="discovery-status">
        {checking ? (
          <div className="checking">
            <div className="spinner" />
            <span>Checking for Hermes Agent...</span>
          </div>
        ) : skipped ? (
          <div className="status-card skipped">
            <span className="status-icon">⏭</span>
            <div>
              <strong>Skipped</strong>
              <p>You can configure Hermes connection later in Settings.</p>
            </div>
          </div>
        ) : hermesConnected ? (
          <div className="status-card found">
            <span className="status-icon">✅</span>
            <div>
              <strong>Hermes Agent Found</strong>
              <p>Connected to: {hermesUrl}</p>
              <p className="mode-label">Mode: {backendMode}</p>
            </div>
          </div>
        ) : (
          <div className="status-card not-found">
            <span className="status-icon">⚠️</span>
            <div>
              <strong>Hermes Agent Not Found</strong>
              <p>No local Hermes installation detected.</p>
              <div className="install-hint">
                <p>To install Hermes Agent:</p>
                <code>npm install -g @hermes-studio/agent</code>
                <p>Or visit hermes-studio.com for installation instructions.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="step-actions">
        <button className="btn-secondary" onClick={onBack}>
          Back
        </button>
        {!checking && !hermesConnected && (
          <button className="btn-secondary" onClick={handleSkip}>
            Skip (Using Remote/Gateway)
          </button>
        )}
        {!checking && (
          <button className="btn-primary" onClick={handleNext}>
            Continue
          </button>
        )}
      </div>

      <style>{`
        .step-hermes-discovery {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 480px;
          width: 100%;
        }

        .step-title {
          font-size: 22px;
          font-weight: 600;
          margin: 0;
          text-align: center;
        }

        .step-description {
          font-size: 14px;
          color: var(--app-text-secondary, #8b949e);
          margin: 0;
          text-align: center;
        }

        .discovery-status {
          padding: 16px;
        }

        .checking {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 32px;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 2px solid var(--app-border, #30363d);
          border-top-color: var(--app-accent, #58a6ff);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .status-card {
          display: flex;
          gap: 16px;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid var(--app-border, #30363d);
        }

        .status-card.found {
          background: rgba(63, 185, 80, 0.1);
          border-color: rgba(63, 185, 80, 0.3);
        }

        .status-card.not-found {
          background: rgba(210, 153, 34, 0.1);
          border-color: rgba(210, 153, 34, 0.3);
        }

        .status-card.skipped {
          background: var(--app-surface, #161b22);
          border-color: var(--app-border, #30363d);
        }

        .status-icon {
          font-size: 24px;
        }

        .status-card strong {
          display: block;
          font-size: 15px;
          margin-bottom: 4px;
        }

        .status-card p {
          font-size: 13px;
          color: var(--app-text-secondary, #8b949e);
          margin: 0;
        }

        .mode-label {
          font-size: 12px;
          color: var(--app-text-muted, #6e7681);
          margin-top: 4px;
        }

        .install-hint {
          margin-top: 12px;
          padding: 12px;
          background: var(--app-surface, #161b22);
          border-radius: 6px;
          border: 1px solid var(--app-border, #30363d);
        }

        .install-hint p {
          font-size: 13px;
          margin: 0 0 6px;
        }

        .install-hint code {
          display: block;
          padding: 8px 12px;
          background: var(--app-bg-alt, #0b0d11);
          border-radius: 4px;
          font-size: 12px;
          font-family: monospace;
          color: var(--app-accent, #58a6ff);
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