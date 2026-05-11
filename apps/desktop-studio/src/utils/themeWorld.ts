import type { ThemePack } from "@hermes-studio/shared-types";

export type ThemeWorldKind = "studio" | "block" | "archive" | "lab" | "paper";

export function resolveThemeWorld(theme: ThemePack): ThemeWorldKind {
  const hints = [
    theme.borders?.style,
    theme.assets?.banner,
    ...(theme.meta.keywords ?? []),
  ].filter(Boolean).join(" ").toLowerCase();

  if (hints.includes("block") || theme.borders?.style === "blocky") return "block";
  if (hints.includes("archive") || hints.includes("manuscript")) return "archive";
  if (hints.includes("lab") || hints.includes("science")) return "lab";
  if (hints.includes("paper") || hints.includes("minimal") || theme.borders?.style === "thin") return "paper";
  return "studio";
}

export function themeWorldMotifs(world: ThemeWorldKind): string[] {
  switch (world) {
    case "block":
      return ["#", "[]", "+", "::"];
    case "archive":
      return ["*", "I", "+", "//"];
    case "lab":
      return ["!", "=", "+", "01"];
    case "paper":
      return ["/", "-", "+", ".."];
    default:
      return ["<>", "/", "*", ">>"];
  }
}
