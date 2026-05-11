import { useThemeStore } from "../../stores/themeStore";
import { resolveThemeWorld, themeWorldMotifs } from "../../utils/themeWorld";

export function ThemeWorld() {
  const theme = useThemeStore((s) => s.activeTheme());
  const world = resolveThemeWorld(theme);
  const motifs = themeWorldMotifs(world);

  return (
    <div className={`theme-world theme-world-${world}`} aria-hidden="true" title={theme.meta.name}>
      <div className="theme-world-atmosphere">
        {motifs.map((motif, index) => (
          <span key={`${motif}-${index}`}>{motif}</span>
        ))}
      </div>
      <div className="theme-pixel-scene">
        <span className="theme-pixel-tile tile-a" />
        <span className="theme-pixel-tile tile-b" />
        <span className="theme-pixel-tile tile-c" />
        <span className="theme-pixel-spark spark-a" />
        <span className="theme-pixel-spark spark-b" />
      </div>
      <div className="theme-world-caption">{theme.meta.name}</div>
    </div>
  );
}
