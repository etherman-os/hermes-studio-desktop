import React from "react";
import type { WizardConfig } from "../FirstRunWizard";

interface WelcomeStepProps {
  config: WizardConfig;
  onNext: (updates?: Partial<WizardConfig>) => void;
  onBack: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="step-welcome">
      <div className="welcome-icon">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          <circle cx="40" cy="40" r="26" stroke="currentColor" strokeWidth="2" opacity="0.5" />
          <circle cx="40" cy="40" r="16" stroke="currentColor" strokeWidth="2" opacity="0.7" />
          <circle cx="40" cy="40" r="6" fill="currentColor" />
        </svg>
      </div>
      <h1 className="welcome-title">Welcome to Hermes Studio</h1>
      <p className="welcome-subtitle">
        A professional desktop environment for building and orchestrating AI agents.
      </p>
      <div className="welcome-features">
        <div className="feature-item">
          <span className="feature-icon">🎯</span>
          <span>Multi-agent orchestration and delegation</span>
        </div>
        <div className="feature-item">
          <span className="feature-icon">📋</span>
          <span>Kanban-style mission tracking</span>
        </div>
        <div className="feature-item">
          <span className="feature-icon">🎨</span>
          <span>Customizable themes and layouts</span>
        </div>
        <div className="feature-item">
          <span className="feature-icon">📦</span>
          <span>Artifact management and versioning</span>
        </div>
      </div>
      <p className="welcome-hint">Let's get you set up in just a few steps.</p>
      <button className="btn-primary" onClick={() => onNext()}>
        Get Started
      </button>

      <style>{`
        .step-welcome {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          max-width: 480px;
          text-align: center;
        }

        .welcome-icon {
          color: var(--app-accent, #58a6ff);
          margin-bottom: 8px;
        }

        .welcome-title {
          font-size: 28px;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .welcome-subtitle {
          font-size: 15px;
          color: var(--app-text-secondary, #8b949e);
          margin: 0;
          line-height: 1.5;
        }

        .welcome-features {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 8px;
          width: 100%;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: var(--app-surface, #161b22);
          border: 1px solid var(--app-border, #30363d);
          border-radius: 8px;
          font-size: 14px;
          text-align: left;
        }

        .feature-icon {
          font-size: 18px;
        }

        .welcome-hint {
          font-size: 13px;
          color: var(--app-text-muted, #6e7681);
          margin: 8px 0 0;
        }

        .btn-primary {
          padding: 10px 32px;
          background: var(--app-accent, #58a6ff);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s;
          margin-top: 8px;
        }

        .btn-primary:hover {
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
}