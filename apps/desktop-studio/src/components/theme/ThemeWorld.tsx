import { useThemeStore } from "../../stores/themeStore";

function worldFromTheme(themeId: string) {
  if (themeId.includes("minecraft")) return "block";
  if (themeId.includes("lotr")) return "archive";
  if (themeId.includes("minions")) return "lab";
  if (themeId.includes("light")) return "paper";
  return "studio";
}

export function ThemeWorld() {
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const theme = useThemeStore((s) => s.activeTheme());
  const world = worldFromTheme(activeThemeId);

  return (
    <div className={`theme-world theme-world-${world}`} aria-hidden="true">
      <div className="theme-companion">
        <div className="theme-companion-head">
          <span className="theme-companion-eye left" />
          <span className="theme-companion-eye right" />
        </div>
        <div className="theme-companion-body">
          <span className="theme-companion-core" />
        </div>
        <div className="theme-companion-shadow" />
      </div>
      <div className="theme-world-caption">{theme.meta.name}</div>
    </div>
  );
}
