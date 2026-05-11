import React from "react";
import type { WizardConfig } from "../FirstRunWizard";

interface BackendStepProps {
  config: WizardConfig;
  onNext: (updates?: Partial<WizardConfig>) => void;
  onBack: () => void;
  isFirst: boolean;
  isLast: boolean;
}

type BackendMode = "local" | "gateway" | "mock";

const BACKEND_OPTIONS: { id: BackendMode; label: string; description: string; recommended?: boolean }[] = [
  {
    id: "local",
    label: "Local CLI",
    description: "Run Hermes Agent as a local process. Best for development and single-user setups.",
    recommended: true,
  },
  {
    id: "gateway",
    label: "Gateway / API",
    description: "Connect to a remote Hermes Gateway. Best for team environments and cloud setups.",
  },
  {
    id: "mock",
    label: "Mock Mode",
    description: "Use simulated responses for testing and demo. No real agent execution.",
  },
];

export function BackendStep({ config, onNext, onBack }: BackendStepProps) {
  const [selectedMode, setSelectedMode] = React.useState<BackendMode>(config.backendMode);

  const handleNext = () => {
    onNext({ backendMode: selectedMode });
  };

  return (
    <div className="step-backend">
      <h2 className="step-title">Backend Mode</h2>
      <p className="step-description">
        How should Studio connect to Hermes Agent?
      </p>

      <div className="backend-options">
        {BACKEND_OPTIONS.map((option) => {
          const isSelected = selectedMode === option.id;
          return (
            <button
              key={option.id}
              className={`backend-card ${isSelected ? "selected" : ""}`}
              onClick={() => setSelectedMode(option.id)}
              type="button"
            >
              <div className="backend-header">
                <span className="backend-label">{option.label}</span>
                {option.recommended && (
                  <span className="recommended-badge">Recommended</span>
                )}
                {isSelected && (
                  <span className="check-icon">✓</span>
                )}
              </div>
              <p className="backend-description">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="step-actions">
        <button className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button className="btn-primary" onClick={handleNext}>
          Continue
        </button>
      </div>

      <style>{`
        .step-backend {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 520px;
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

        .backend-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .backend-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 14px 16px;
          background: var(--app-surface, #161b22);
          border: 2px solid transparent;
          border-radius: 10px;
          cursor: pointer;
          text-align: left;
          transition: border-color 0.15s;
        }

        .backend-card:hover {
          border-color: var(--app-border, #30363d);
        }

        .backend-card.selected {
          border-color: var(--app-accent, #58a6ff);
          background: var(--app-accent-subtle, rgba(88, 166, 255, 0.08));
        }

        .backend-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .backend-label {
          font-size: 15px;
          font-weight: 600;
          color: var(--app-text, #e6edf3);
        }

        .recommended-badge {
          font-size: 11px;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 10px;
          background: var(--app-ok, #3fb950);
          color: white;
        }

        .check-icon {
          margin-left: auto;
          font-size: 16px;
          color: var(--app-accent, #58a6ff);
        }

        .backend-description {
          font-size: 13px;
          color: var(--app-text-secondary, #8b949e);
          margin: 0;
          line-height: 1.4;
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