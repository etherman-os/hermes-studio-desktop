import { invoke } from "@tauri-apps/api/core";
import { usePreviewStore } from "../../stores/previewStore";

interface PreviewLauncherProps {
  url: string;
  title?: string;
  label?: string;
  className?: string;
}

export function PreviewLauncher({
  url,
  title,
  label = "Preview",
  className = "tool-button",
}: PreviewLauncherProps) {
  const setCurrentUrl = usePreviewStore((s) => s.setCurrentUrl);
  const setOpen = usePreviewStore((s) => s.setOpen);

  async function handleClick() {
    try {
      const windowTitle = title
        ? `Preview: ${title}`
        : "Preview – Hermes Studio";
      await invoke("open_preview_window", { url, title: windowTitle });
      setCurrentUrl(url);
      setOpen(true);
    } catch (err) {
      console.error("Failed to open preview window:", err);
    }
  }

  return (
    <button className={className} onClick={handleClick} title={`Preview: ${url}`}>
      {label}
    </button>
  );
}
