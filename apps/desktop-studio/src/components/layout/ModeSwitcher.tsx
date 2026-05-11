import { Code2, Cog, Sparkles, Zap } from "lucide-react";
import { type Mode, useLayoutStore } from "../../stores/layoutStore";

const MODES: { id: Mode; label: string; icon: typeof Sparkles }[] = [
  { id: "create",   label: "CREATE",  icon: Sparkles },
  { id: "code",     label: "CODE",    icon: Code2    },
  { id: "automate", label: "AUTOMATE", icon: Zap     },
  { id: "manage",   label: "MANAGE",  icon: Cog      },
];

export function ModeSwitcher() {
  const activeMode = useLayoutStore((s) => s.activeMode);
  const setActiveMode = useLayoutStore((s) => s.setActiveMode);

  return (
    <div className="mode-switcher" role="tablist" aria-label="Navigation mode">
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeMode === id}
          className={`mode-tab mode-tab-${id} ${activeMode === id ? "active" : ""}`}
          onClick={() => setActiveMode(id)}
          title={label}
          data-testid={`mode-${id}`}
        >
          <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
          <span>{label}</span>
          {activeMode === id && <span data-testid="active-mode" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}