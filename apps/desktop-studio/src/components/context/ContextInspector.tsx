import React from "react";
import { useProfileStore } from "../../stores/profileStore";
import * as api from "../../api/studioClient";

const CONTEXT_ITEMS = [
  { id: "soul", label: "SOUL.md", state: "not indexed" },
  { id: "agents", label: "AGENTS.md", state: "not indexed" },
  { id: "claude", label: "CLAUDE.md", state: "not indexed" },
  { id: "memory", label: "Memory", state: "events only" },
  { id: "skills", label: "Skills", state: "future layer" },
  { id: "references", label: "@ references", state: "future layer" },
];

export function ContextInspector() {
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const [model, setModel] = React.useState<api.ModelConfig | null>(null);

  React.useEffect(() => {
    api.getModelConfig().then(setModel).catch(() => setModel(null));
  }, []);

  return (
    <div className="context-inspector">
      <div className="surface-header">
        <div>
          <div className="workbench-eyebrow">Context Stack</div>
          <h2>Runtime context map</h2>
        </div>
      </div>
      <div className="context-grid">
        {CONTEXT_ITEMS.map((item) => (
          <div key={item.id} className="context-row">
            <span>{item.label}</span>
            <span>{item.state}</span>
          </div>
        ))}
        <div className="context-row">
          <span>Active profile</span>
          <span>{activeProfile?.name ?? "unknown"}</span>
        </div>
        <div className="context-row">
          <span>Model/provider</span>
          <span>{model ? `${model.provider} / ${model.model}` : "unavailable"}</span>
        </div>
      </div>
    </div>
  );
}
