import React from "react";
import { useThemeStore } from "../../../stores/themeStore";
import type { WizardConfig } from "../FirstRunWizard";

interface ThemeStepProps {
  config: WizardConfig;
  onNext: (updates?: Partial<WizardConfig>) => void;
  onBack: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const THUMBNAIL_COLORS: Record<string, { bg: string; accent: string; text: string }> = {
  "default-dark": { bg: "#0f1117", accent: "#58a6ff", text: "#e6edf3" },
  "minimal-light": { bg: "#ffffff", accent: "#1971c2", text: "#212529" },
  "minecraft-overworld": { bg: "#14170f", accent: "#76c043", text: "#edf5d1" },
  "example-minions": { bg: "#1a1a0f", accent: "#f9d71c", text: "#ffffff" },
  "example-lotr": { bg: "#1a1510", accent: "#c8a951", text: "#e8dcc8" },
};

export function ThemeStep({ config, onNext, onBack }: ThemeStepProps) {
  const themes = useThemeStore((s) => s.themes);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [selectedId, setSelectedId] = React.useState(config.themeId);

  const themeIds = Object.keys(themes);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setTheme(id);
  };

  const handleNext = () => {
    onNext({ themeId: selectedId });
  };

  return (
    <div className="step-theme">
      <h2 className="step-title">Choose Your Theme</h2>
      <p className="step-description">
        Pick a visual style that suits your workflow.
      </p>

      <div className="theme-grid">
        {themeIds.map((id) => {
          const theme = themes[id];
          const colors = THUMBNAIL_COLORS[id] ?? { bg: "#161b22", accent: "#58a6ff", text: "#e6edf3" };
          const isSelected = selectedId === id;

          return (
            <button
              key={id}
              className={`theme-card ${isSelected ? "selected" : ""}`}
              onClick={() => handleSelect(id)}
              type="button"
            >
              <div
                className="theme-preview"
                style={{ background: colors.bg }}
              >
                <div className="preview-bar" style={{ background: colors.accent }} />
                <div className="preview-content">
                  <div className="preview-block" style={{ background: colors.text, opacity: 0.2 }} />
                  <div className="preview-block" style={{ background: colors.text, opacity: 0.1 }} />
                  <div className="preview-block" style={{ background: colors.accent, opacity: 0.6 }} />
                </div>
                {isSelected && (
                  <div className="preview-check" style={{ color: colors.accent }}>
                    ✓
                  </div>
                )}
              </div>
              <span className="theme-name">{theme.meta.name}</span>
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
        .step-theme {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 600px;
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

        .theme-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
        }

        .theme-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 8px;
          background: var(--app-surface, #161b22);
          border: 2px solid transparent;
          border-radius: 10px;
          cursor: pointer;
          transition: border-color 0.15s, transform 0.15s;
        }

        .theme-card:hover {
          transform: translateY(-2px);
        }

        .theme-card.selected {
          border-color: var(--app-accent, #58a6ff);
        }

        .theme-preview {
          position: relative;
          height: 80px;
          border-radius: 6px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .preview-bar {
          height: 12px;
          width: 100%;
        }

        .preview-content {
          flex: 1;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .preview-block {
          height: 8px;
          border-radius: 2px;
        }

        .preview-check {
          position: absolute;
          top: 4px;
          right: 4px;
          font-size: 16px;
          font-weight: bold;
        }

        .theme-name {
          font-size: 12px;
          font-weight: 500;
          text-align: center;
          color: var(--app-text, #e6edf3);
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