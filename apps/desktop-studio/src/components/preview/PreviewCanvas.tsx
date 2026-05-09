import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { usePreviewStore, type ConsoleEntry } from "../../stores/previewStore";

function captureConsole(
  level: ConsoleEntry["level"],
  args: unknown[],
): ConsoleEntry {
  return {
    level,
    message: args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" "),
    timestamp: new Date().toISOString(),
  };
}

function normalizePreviewUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizedPreviewDoc(content: string) {
  if (typeof window === "undefined") return content;
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/html");
  doc.querySelectorAll("script, form, iframe, object, embed").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        node.removeAttribute(attr.name);
      }
    }
  });
  const csp = doc.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute("content", "default-src 'none'; img-src data: blob: file: http: https:; style-src 'unsafe-inline' file: http: https:; font-src data: file: http: https:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'");
  doc.head.prepend(csp);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}

export function PreviewCanvas() {
  const currentUrl = usePreviewStore((s) => s.currentUrl);
  const currentHtml = usePreviewStore((s) => s.currentHtml);
  const consoleLogs = usePreviewStore((s) => s.consoleLogs);
  const setCurrentUrl = usePreviewStore((s) => s.setCurrentUrl);
  const setCurrentHtml = usePreviewStore((s) => s.setCurrentHtml);
  const addConsoleLog = usePreviewStore((s) => s.addConsoleLog);
  const clearConsoleLogs = usePreviewStore((s) => s.clearConsoleLogs);

  const [inputUrl, setInputUrl] = React.useState(currentUrl);
  const [showConsole, setShowConsole] = React.useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    const initial = (window as unknown as Record<string, unknown>).__PREVIEW_INITIAL_URL;
    if (typeof initial === "string" && initial.length > 0) {
      const normalized = normalizePreviewUrl(initial);
      if (normalized) {
        setInputUrl(normalized);
        setCurrentUrl(normalized);
      }
    }
    const initialHtml = (window as unknown as Record<string, unknown>).__PREVIEW_INITIAL_HTML;
    if (typeof initialHtml === "string" && initialHtml.length > 0) {
      setInputUrl("");
      setCurrentHtml(initialHtml);
    }
  }, [setCurrentHtml, setCurrentUrl]);

  React.useEffect(() => {
    const unlisten = listen<string>("preview:navigate", (event) => {
      const url = normalizePreviewUrl(event.payload);
      if (!url) return;
      setInputUrl(url);
      setCurrentUrl(url);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [setCurrentUrl]);

  React.useEffect(() => {
    const unlisten = listen<string>("preview:html", (event) => {
      setInputUrl("");
      setCurrentHtml(event.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [setCurrentHtml]);

  React.useEffect(() => {
    const original: Record<string, (...args: unknown[]) => void> = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    };

    for (const level of ["log", "warn", "error", "info"] as const) {
      const fn = (...args: unknown[]) => {
        original[level](...args);
        addConsoleLog(captureConsole(level, args));
      };
      (console as unknown as Record<string, unknown>)[level] = fn;
    }

    return () => {
      for (const level of ["log", "warn", "error", "info"] as const) {
        (console as unknown as Record<string, unknown>)[level] = original[level];
      }
    };
  }, [addConsoleLog]);

  function handleNavigate(e: React.FormEvent) {
    e.preventDefault();
    const url = normalizePreviewUrl(inputUrl);
    if (!url) {
      addConsoleLog({
        level: "warn",
        message: "Preview only supports http and https URLs.",
        timestamp: new Date().toISOString(),
      });
      return;
    }
    setCurrentUrl(url);
    setInputUrl(url);
  }

  async function handleScreenshot() {
    try {
      const win = getCurrentWindow();
      const title = await win.title();
      addConsoleLog({
        level: "info",
        message: `Screenshot captured from: ${title}`,
        timestamp: new Date().toISOString(),
      });
    } catch {
      addConsoleLog({
        level: "warn",
        message:
          "Screenshot capture is not available in this context. Use browser DevTools.",
        timestamp: new Date().toISOString(),
      });
    }
  }

  async function handleClose() {
    try {
      await invoke("close_preview_window");
    } catch {
      const win = getCurrentWindow();
      await win.close();
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--app-bg, #1a1a2e)",
        color: "var(--app-text, #e0e0e0)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--app-border, #333)",
          background: "var(--app-bg-elevated, #222)",
        }}
      >
        <form
          onSubmit={handleNavigate}
          style={{
            display: "flex",
            flex: 1,
            gap: 6,
          }}
        >
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Enter URL to preview…"
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 4,
              border: "1px solid var(--app-border, #444)",
              background: "var(--app-input-bg, #1a1a2e)",
              color: "var(--app-text, #e0e0e0)",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              border: "1px solid var(--app-accent, #6366f1)",
              background: "var(--app-accent, #6366f1)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Go
          </button>
        </form>
        <button
          onClick={handleScreenshot}
          title="Capture Screenshot"
          style={{
            padding: "6px 12px",
            borderRadius: 4,
            border: "1px solid var(--app-border, #444)",
            background: "var(--app-bg-elevated, #2a2a3e)",
            color: "var(--app-text, #e0e0e0)",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Screenshot
        </button>
        <button
          onClick={() => setShowConsole((v) => !v)}
          title="Toggle Console"
          style={{
            padding: "6px 12px",
            borderRadius: 4,
            border: "1px solid var(--app-border, #444)",
            background: showConsole
              ? "var(--app-accent, #6366f1)"
              : "var(--app-bg-elevated, #2a2a3e)",
            color: showConsole ? "#fff" : "var(--app-text, #e0e0e0)",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Console ({consoleLogs.length})
        </button>
        <button
          onClick={handleClose}
          title="Close Preview"
          style={{
            padding: "6px 12px",
            borderRadius: 4,
            border: "1px solid var(--app-danger, #ef4444)",
            background: "var(--app-danger, #ef4444)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Close
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, position: "relative" }}>
          {currentHtml ? (
            <iframe
              ref={iframeRef}
              srcDoc={sanitizedPreviewDoc(currentHtml)}
              title="Artifact Preview"
              sandbox=""
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                background: "#fff",
              }}
            />
          ) : currentUrl ? (
            <iframe
              ref={iframeRef}
              src={currentUrl}
              title="Preview"
              sandbox="allow-scripts allow-forms allow-popups"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                background: "#fff",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--app-text-muted, #888)",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 48, opacity: 0.3 }}>◇</div>
              <div>Enter a URL above to preview web content</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                Or launch from Run Ledger / Artifact Shelf
              </div>
            </div>
          )}
        </div>

        {showConsole && (
          <div
            style={{
              height: 180,
              borderTop: "1px solid var(--app-border, #333)",
              background: "var(--app-bg, #1a1a2e)",
              overflow: "auto",
              fontFamily: "monospace",
              fontSize: 12,
              padding: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ color: "var(--app-text-muted, #888)" }}>
                Console Output
              </span>
              <button
                onClick={clearConsoleLogs}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--app-text-muted, #888)",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Clear
              </button>
            </div>
            {consoleLogs.length === 0 && (
              <div style={{ color: "var(--app-text-muted, #666)", fontStyle: "italic" }}>
                No console output yet.
              </div>
            )}
            {consoleLogs.map((entry, i) => (
              <div
                key={i}
                style={{
                  color:
                    entry.level === "error"
                      ? "var(--app-danger, #ef4444)"
                      : entry.level === "warn"
                        ? "var(--app-warn, #f59e0b)"
                        : "var(--app-text-secondary, #ccc)",
                  marginBottom: 2,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                <span style={{ opacity: 0.5, marginRight: 6 }}>
                  [{new Date(entry.timestamp).toLocaleTimeString()}]
                </span>
                <span style={{ marginRight: 6 }}>[{entry.level}]</span>
                {entry.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
