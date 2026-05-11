import React from "react";
import { AppFrame } from "./components/layout/AppFrame";
import { PreviewCanvas } from "./components/preview/PreviewCanvas";
import { StartupScreen } from "./components/common/StartupScreen";
import { FirstRunWizard, isWizardCompleted } from "./components/onboarding/FirstRunWizard";
import { useThemeStore } from "./stores/themeStore";
import type { WizardConfig } from "./components/onboarding/FirstRunWizard";

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
  const [appReady, setAppReady] = React.useState(false);
  const [wizardComplete, setWizardComplete] = React.useState(() => isWizardCompleted());

  React.useEffect(() => {
    initTheme();
  }, [initTheme]);

  const handleWizardComplete = React.useCallback((_config: WizardConfig) => {
    // Wizard configuration is persisted internally
    setWizardComplete(true);
    setAppReady(true);
  }, []);

  if (isPreview) return <PreviewCanvas />;

  // Show first-run wizard on initial launch
  if (!wizardComplete) {
    return <FirstRunWizard onComplete={handleWizardComplete} />;
  }

  // Not yet ready — show startup screen (handles adapter lifecycle)
  if (!appReady) {
    return <StartupScreen onReady={() => setAppReady(true)} />;
  }

  // App is ready — render main UI
  return <AppFrame />;
}