import React from "react";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import type { WizardConfig } from "../FirstRunWizard";

interface WorkspaceStepProps {
  config: WizardConfig;
  onNext: (updates?: Partial<WizardConfig>) => void;
  onBack: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function WorkspaceStep({ config, onNext, onBack }: WorkspaceStepProps) {
  const recentWorkspaces = useWorkspaceStore((s) => s.recentWorkspaces);
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace);
  const [selectedPath, setSelectedPath] = React.useState(config.workspace ?? "");
  const [showRecent, setShowRecent] = React.useState(false);

  const handleBrowse = async () => {
    // Use Tauri's file dialog if available, otherwise fallback to path input
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Workspace Folder",
      });
      if (selected && typeof selected === "string") {
        setSelectedPath(selected);
        selectWorkspace(selected);
      }
    } catch {
      // Dialog not available, user can type path manually
      setShowRecent(true);
    }
  };

  const handleSelectRecent = (path: string) => {
    setSelectedPath(path);
    selectWorkspace(path);
  };

  const handleNext = () => {
    if (selectedPath.trim()) {
      selectWorkspace(selectedPath.trim());
    }
    onNext({ workspace: selectedPath.trim() || null });
  };

  return (
    <div className="step-workspace">
      <h2 className="step-title">Choose Your Workspace</h2>
      <p className="step-description">
        Select a default folder for your projects. This will be the working
        directory for agent runs.
      </p>

      <div className="workspace-input-group">
        <label className="input-label">Workspace Path</label>
        <div className="input-row">
          <input
            type="text"
            className="workspace-input"
            value={selectedPath}
            onChange={(e) => setSelectedPath(e.target.value)}
            placeholder="/path/to/your/projects"
          />
          <button className="btn-browse" onClick={handleBrowse}>
            Browse
          </button>
        </div>
      </div>

      {recentWorkspaces.length > 0 && (
        <div className="recent-workspaces">
          <button
            className="recent-toggle"
            onClick={() => setShowRecent(!showRecent)}
          >
            Recent Workspaces {showRecent ? "▲" : "▼"}
          </button>
          {showRecent && (
            <div className="recent-list">
              {recentWorkspaces.map((path) => (
                <button
                  key={path}
                  className={`recent-item ${selectedPath === path ? "selected" : ""}`}
                  onClick={() => handleSelectRecent(path)}
                >
                  {path}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="step-actions">
        <button className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button className="btn-primary" onClick={handleNext}>
          Continue
        </button>
      </div>

      <style>{`
        .step-workspace {
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
          line-height: 1.5;
        }

        .workspace-input-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .input-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--app-text-secondary, #8b949e);
        }

        .input-row {
          display: flex;
          gap: 8px;
        }

        .workspace-input {
          flex: 1;
          padding: 10px 14px;
          background: var(--app-surface, #161b22);
          border: 1px solid var(--app-border, #30363d);
          border-radius: 8px;
          color: var(--app-text, #e6edf3);
          font-size: 14px;
          outline: none;
        }

        .workspace-input:focus {
          border-color: var(--app-accent, #58a6ff);
        }

        .workspace-input::placeholder {
          color: var(--app-text-muted, #6e7681);
        }

        .btn-browse {
          padding: 10px 20px;
          background: var(--app-surface-alt, #1c2333);
          color: var(--app-text, #e6edf3);
          border: 1px solid var(--app-border, #30363d);
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          white-space: nowrap;
          transition: border-color 0.15s;
        }

        .btn-browse:hover {
          border-color: var(--app-text-muted, #6e7681);
        }

        .recent-workspaces {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .recent-toggle {
          padding: 8px 12px;
          background: transparent;
          border: 1px solid var(--app-border, #30363d);
          border-radius: 6px;
          color: var(--app-text-secondary, #8b949e);
          font-size: 13px;
          cursor: pointer;
          text-align: left;
        }

        .recent-toggle:hover {
          border-color: var(--app-text-muted, #6e7681);
        }

        .recent-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 160px;
          overflow-y: auto;
        }

        .recent-item {
          padding: 8px 12px;
          background: var(--app-surface, #161b22);
          border: 1px solid transparent;
          border-radius: 6px;
          color: var(--app-text, #e6edf3);
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .recent-item:hover {
          background: var(--app-surface-alt, #1c2333);
        }

        .recent-item.selected {
          border-color: var(--app-accent, #58a6ff);
          background: var(--app-accent-subtle, rgba(88, 166, 255, 0.1));
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