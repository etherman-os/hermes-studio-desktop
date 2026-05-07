import React from "react";
import { AppFrame } from "./components/layout/AppFrame";
import { PreviewCanvas } from "./components/preview/PreviewCanvas";
import { useThemeStore } from "./stores/themeStore";

function isPreviewWindow(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("preview") === "true") return true;
    // @ts-expect-error Tauri injected flag
    if (window.__PREVIEW_INITIAL_URL !== undefined) return true;
  } catch {
    // Not in a Tauri context or URL parsing failed
  }
  return false;
}

export default function App() {
  const initTheme = useThemeStore((s) => s.initTheme);
  const [isPreview] = React.useState(() => isPreviewWindow());

  React.useEffect(() => {
    initTheme();
  }, [initTheme]);

  if (isPreview) return <PreviewCanvas />;
  return <AppFrame />;
}
