import React from "react";
import { useUiStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

export function WorkspacePicker() {
  const open = useUiStore((s) => s.workspacePickerOpen);
  const close = useUiStore((s) => s.closeWorkspacePicker);
  const selectedWorkspace = useWorkspaceStore((s) => s.selectedWorkspace);
  const recentWorkspaces = useWorkspaceStore((s) => s.recentWorkspaces);
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const [path, setPath] = React.useState(selectedWorkspace ?? "");

  React.useEffect(() => {
    if (open) setPath(selectedWorkspace ?? "");
  }, [open, selectedWorkspace]);

  React.useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  if (!open) return null;

  function submit() {
    selectWorkspace(path);
    close();
  }

  return (
    <div className="modal-backdrop" onClick={close} role="dialog" aria-modal="true" aria-label="Select workspace">
      <div className="studio-modal workspace-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="workbench-eyebrow">Workspace</div>
            <h2 id="workspace-title">Select project folder</h2>
          </div>
          <button className="icon-button" onClick={close} title="Close" aria-label="Close dialog">x</button>
        </div>
        <div className="modal-body">
          <label className="field-label" htmlFor="workspace-path">Workspace path</label>
          <div className="inline-field">
            <input
              id="workspace-path"
              className="studio-input"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/home/user/project"
              autoFocus
            />
            <button className="primary-button" onClick={submit}>Use Folder</button>
          </div>
          <div className="field-help">
            Workspace paths are Studio-side run metadata for now. They are not forwarded to Hermes unless Hermes exposes an official cwd/workspace field.
          </div>

          <div className="modal-section-title">Recent workspaces</div>
          {recentWorkspaces.length === 0 ? (
            <div className="panel-note">No recent workspaces yet.</div>
          ) : (
            <div className="workspace-list">
              {recentWorkspaces.map((item) => (
                <button key={item} className="workspace-row" onClick={() => { selectWorkspace(item); close(); }}>
                  <span>{item}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="tool-button" onClick={() => { clearWorkspace(); close(); }}>Clear Workspace</button>
          <button className="tool-button" onClick={close}>Cancel</button>
          <button className="primary-button" onClick={submit}>Select Workspace</button>
        </div>
      </div>
    </div>
  );
}
