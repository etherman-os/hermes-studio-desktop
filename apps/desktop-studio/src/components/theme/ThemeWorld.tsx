import { useThemeStore } from "../../stores/themeStore";

function worldFromTheme(themeId: string) {
  if (themeId.includes("minecraft")) return "block";
  if (themeId.includes("lotr")) return "archive";
  if (themeId.includes("minions")) return "lab";
  if (themeId.includes("light")) return "paper";
  return "studio";
}

function worldMotifs(world: string) {
  switch (world) {
    case "block":
      return ["#", "[]", "+"];
    case "archive":
      return ["*", "I", "+"];
    case "lab":
      return ["!", "=", "+"];
    case "paper":
      return ["/", "-", "+"];
    default:
      return ["<>", "/", "*"];
  }
}

export function ThemeWorld() {
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const theme = useThemeStore((s) => s.activeTheme());
  const world = worldFromTheme(activeThemeId);
  const motifs = worldMotifs(world);

  return (
    <div className={`theme-world theme-world-${world}`} aria-hidden="true">
      <div className="theme-world-atmosphere">
        {motifs.map((motif, index) => (
          <span key={`${motif}-${index}`}>{motif}</span>
        ))}
      </div>
      <div className="theme-companion">
        <span className="theme-companion-antenna" />
        <div className="theme-companion-head">
          <span className="theme-companion-eye left" />
          <span className="theme-companion-eye right" />
          <span className="theme-companion-feature" />
        </div>
        <div className="theme-companion-body">
          <span className="theme-companion-core" />
          <span className="theme-companion-tool" />
        </div>
        <div className="theme-companion-shadow" />
      </div>
      <div className="theme-world-caption">{theme.meta.name}</div>
    </div>
  );
}
