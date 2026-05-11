import React from "react";
import { WelcomeStep } from "./steps/WelcomeStep";
import { HermesDiscoveryStep } from "./steps/HermesDiscoveryStep";
import { WorkspaceStep } from "./steps/WorkspaceStep";
import { ThemeStep } from "./steps/ThemeStep";
import { BackendStep } from "./steps/BackendStep";
import { ReadyStep } from "./steps/ReadyStep";

const WIZARD_STORAGE_KEY = "hermes-studio-wizard-completed";

export interface WizardConfig {
  hermesFound: boolean;
  hermesVersion: string | null;
  workspace: string | null;
  themeId: string;
  backendMode: "local" | "gateway" | "mock";
}

interface FirstRunWizardProps {
  onComplete: (config: WizardConfig) => void;
}

const STEPS = [
  { id: "welcome", label: "Welcome", component: WelcomeStep },
  { id: "hermes", label: "Hermes", component: HermesDiscoveryStep },
  { id: "workspace", label: "Workspace", component: WorkspaceStep },
  { id: "theme", label: "Theme", component: ThemeStep },
  { id: "backend", label: "Backend", component: BackendStep },
  { id: "ready", label: "Ready", component: ReadyStep },
] as const;

export function FirstRunWizard({ onComplete }: FirstRunWizardProps) {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [config, setConfig] = React.useState<WizardConfig>({
    hermesFound: false,
    hermesVersion: null,
    workspace: null,
    themeId: "default-dark",
    backendMode: "local",
  });

  const step = STEPS[currentStep];
  const StepComponent = step.component;
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  const handleNext = (updates?: Partial<WizardConfig>) => {
    if (updates) {
      setConfig((prev) => ({ ...prev, ...updates }));
    }
    if (isLast) {
      // Mark wizard as completed
      try {
        localStorage.setItem(WIZARD_STORAGE_KEY, "true");
      } catch {
        // localStorage unavailable
      }
      onComplete(config);
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      setCurrentStep((s) => s - 1);
    }
  };

  return (
    <div className="first-run-wizard">
      <div className="wizard-header">
        <div className="wizard-progress">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`progress-step ${i === currentStep ? "active" : ""} ${i < currentStep ? "completed" : ""}`}
            >
              <div className="step-dot">{i < currentStep ? "✓" : String(i + 1)}</div>
              <span className="step-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="wizard-body">
        <StepComponent
          config={config}
          onNext={handleNext}
          onBack={handleBack}
          isFirst={isFirst}
          isLast={isLast}
        />
      </div>

      <style>{`
        .first-run-wizard {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          background: var(--app-bg, #0f1117);
          color: var(--app-text, #e6edf3);
          z-index: 10000;
        }

        .wizard-header {
          padding: 24px 32px 16px;
          border-bottom: 1px solid var(--app-border, #30363d);
        }

        .wizard-progress {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: center;
        }

        .progress-step {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          background: var(--app-surface, #161b22);
          border: 1px solid var(--app-border, #30363d);
          opacity: 0.5;
          transition: all 0.2s;
        }

        .progress-step.active {
          opacity: 1;
          border-color: var(--app-accent, #58a6ff);
          background: var(--app-accent-subtle, rgba(88, 166, 255, 0.15));
        }

        .progress-step.completed {
          opacity: 0.8;
        }

        .step-dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--app-border, #30363d);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
        }

        .progress-step.active .step-dot {
          background: var(--app-accent, #58a6ff);
          color: white;
        }

        .progress-step.completed .step-dot {
          background: var(--app-ok, #3fb950);
          color: white;
        }

        .step-label {
          font-size: 12px;
          font-weight: 500;
        }

        .wizard-body {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}

export function isWizardCompleted(): boolean {
  try {
    return localStorage.getItem(WIZARD_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function resetWizardCompletion(): void {
  try {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}