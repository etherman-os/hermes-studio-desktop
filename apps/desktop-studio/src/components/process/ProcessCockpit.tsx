import React from "react";
import { useProcessStore } from "../../stores/processStore";
import { ProcessCard } from "./ProcessCard";

export function ProcessCockpit() {
  const processes = useProcessStore((s) => s.processes);
  const templates = useProcessStore((s) => s.templates);
  const loading = useProcessStore((s) => s.loading);
  const error = useProcessStore((s) => s.error);
  const selectedProcessId = useProcessStore((s) => s.selectedProcessId);
  const loadProcesses = useProcessStore((s) => s.loadProcesses);
  const startProcess = useProcessStore((s) => s.startProcess);
  const stopProcess = useProcessStore((s) => s.stopProcess);
  const removeProcess = useProcessStore((s) => s.removeProcess);
  const selectProcess = useProcessStore((s) => s.selectProcess);
  const clearError = useProcessStore((s) => s.clearError);

  React.useEffect(() => {
    void loadProcesses();
    const timer = window.setInterval(() => {
      void loadProcesses();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadProcesses]);

  const runningCount = processes.filter((p) => p.status === "running").length;
  const groupedTemplates = React.useMemo(() => {
    const groups = new Map<string, typeof templates>();
    for (const template of templates) {
      const group = template.category === "hermes" ? "Hermes Runtime" : "Studio";
      groups.set(group, [...(groups.get(group) ?? []), template]);
    }
    return [...groups.entries()];
  }, [templates]);

  function copyPid(processId: string) {
    const proc = processes.find((p) => p.id === processId);
    if (proc?.pid) {
      void navigator.clipboard?.writeText(String(proc.pid));
    }
  }

  function copyLogs(processId: string) {
    const logs = useProcessStore.getState().processLogs[processId] ?? [];
    void navigator.clipboard?.writeText(logs.join("\n"));
  }

  return (
    <div className="process-cockpit" data-testid="process-cockpit">
      <div className="process-cockpit-header" data-testid="process-cockpit-header">
        <div>
          <div className="workbench-eyebrow">Process Cockpit</div>
          <div className="process-cockpit-title">
            {runningCount > 0 ? `${runningCount} process${runningCount > 1 ? "es" : ""} running` : "No processes running"}
          </div>
        </div>
        <div className="process-cockpit-actions">
          <button className="tool-button" onClick={() => void loadProcesses()}>
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="inline-warning">
          {error}
          <button className="tool-button" onClick={clearError}>Dismiss</button>
        </div>
      )}

      <div className="process-templates">
        <div className="pane-label">Start a Process</div>
        {groupedTemplates.map(([group, items]) => (
          <div key={group} className="process-template-group">
            <div className="process-template-group-title">{group}</div>
            <div className="process-template-grid">
              {items.map((t) => {
                const isTemplateRunning = processes.some((p) => p.template_id === t.id && p.status === "running");
                return (
                  <button
                    key={t.id}
                    className="process-template-card"
                    onClick={() => void startProcess(t.id)}
                    disabled={isTemplateRunning}
                    title={t.description}
                  >
                    <span className="process-template-name">{t.name}</span>
                    <span className="process-template-cmd">{t.command}</span>
                    {isTemplateRunning && <span className="process-template-running">Running</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {processes.length > 0 && (
        <div className="process-list">
          <div className="pane-label">Managed Processes ({processes.length})</div>
          {processes.map((proc) => (
            <ProcessCard
              key={proc.id}
              process={proc}
              isSelected={selectedProcessId === proc.id}
              onSelect={() => selectProcess(proc.id)}
              onStop={() => void stopProcess(proc.id)}
              onRemove={() => void removeProcess(proc.id)}
              onCopyLogs={() => copyLogs(proc.id)}
              onCopyPid={() => copyPid(proc.id)}
            />
          ))}
        </div>
      )}

      {processes.length === 0 && !loading && (
        <div className="workbench-empty compact">
          No managed processes. Use the templates above to start a dev server, test runner, or build process.
        </div>
      )}

      <div className="process-notice">
        Only predefined process templates are allowed. Arbitrary shell commands cannot be executed through this interface.
      </div>
    </div>
  );
}
