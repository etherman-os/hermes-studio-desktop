import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface StartupScreenProps {
  onReady: () => void;
}

type StartupPhase = "starting" | "checking" | "ready" | "error";

export function StartupScreen({ onReady }: StartupScreenProps) {
  const [phase, setPhase] = React.useState<StartupPhase>("starting");
  const [dots, setDots] = React.useState("");
  const [message, setMessage] = React.useState("Starting Hermes Studio...");
  const [error, setError] = React.useState<string | null>(null);
  const unlistenRef = React.useRef<(() => void) | null>(null);

  // Animate loading dots
  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Listen for adapter status events and poll for startup
  React.useEffect(() => {
    let cancelled = false;

    async function beginStartup() {
      // Listen for adapter:status events from Rust side
      let unlistenFn: (() => void) | null = null;
      try {
        unlistenFn = await listen<{ status: string; message: string }>(
          "adapter:status",
          (event) => {
            if (cancelled) return;
            const { status, message: msg } = event.payload;
            setMessage(msg);
            if (status === "ready") {
              setPhase("ready");
              setTimeout(onReady, 300);
            } else if (status === "error") {
              setPhase("error");
              setError(msg);
            }
          }
        );
      } catch {
        // listen() failed; skip registration
        return;
      }
      if (cancelled) {
        unlistenFn();
        return;
      }
      unlistenRef.current = unlistenFn;

      // Call ensure_adapter_running to trigger Rust-side startup
      setPhase("checking");
      setMessage("Connecting to Hermes Agent...");

      try {
        const result = await Promise.race([
          invoke<{
            status: string;
            message: string;
            running: boolean;
            ready: boolean;
          }>("ensure_adapter_running"),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Adapter startup timeout")), 35_000)
          ),
        ]);

        if (cancelled) return;

        if (result.ready) {
          setPhase("ready");
          setMessage("Connected!");
          setTimeout(onReady, 300);
        } else if (result.status === "starting") {
          // Adapter is starting asynchronously, wait for events
          setMessage(result.message || "Starting adapter...");
        }
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    void beginStartup();

    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [onReady]);

  const handleRetry = React.useCallback(() => {
    window.location.reload();
  }, []);

  const handleSkip = React.useCallback(() => {
    onReady();
  }, [onReady]);

  return (
    <div className="startup-screen">
      <div className="startup-content">
        <div className="startup-logo">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" opacity="0.3" />
            <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="2" opacity="0.5" />
            <circle cx="32" cy="32" r="12" stroke="currentColor" strokeWidth="2" opacity="0.7" />
            <circle cx="32" cy="32" r="4" fill="currentColor" />
          </svg>
        </div>
        <h1 className="startup-title">Hermes Studio</h1>
        <p className="startup-message">
          {message}
          <span className="startup-dots">{dots}</span>
        </p>

        {phase === "checking" && (
          <div className="startup-spinner">
            <div className="spinner-ring" />
          </div>
        )}

        {phase === "error" && (
          <>
            <div className="startup-error">
              <p className="error-message">{error || "Failed to connect to adapter"}</p>
              <p className="warning-message">Some features may be limited without Hermes connection.</p>
              <div className="error-actions">
                <button className="btn-primary" onClick={handleRetry}>
                  Retry
                </button>
                <button className="btn-secondary" onClick={handleSkip}>
                  Continue Anyway
                </button>
              </div>
            </div>
          </>
        )}

        <p className="startup-hint">
          {phase === "starting" || phase === "checking"
            ? "This usually takes a few seconds"
            : ""}
        </p>
      </div>

      <style>{`
        .startup-screen {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--app-bg, #0f1117);
          color: var(--app-text, #e6edf3);
          z-index: 9999;
        }

        .startup-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
          max-width: 320px;
        }

        .startup-logo {
          color: var(--app-accent, #58a6ff);
          animation: startupPulse 2s ease-in-out infinite;
        }

        @keyframes startupPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }

        .startup-title {
          font-size: 24px;
          font-weight: 600;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .startup-message {
          font-size: 14px;
          color: var(--app-text-muted, #6e7681);
          margin: 0;
        }

        .startup-dots {
          display: inline-block;
          min-width: 24px;
          text-align: left;
        }

        .startup-spinner {
          margin: 8px 0;
        }

        .spinner-ring {
          width: 32px;
          height: 32px;
          border: 2px solid var(--app-border, #30363d);
          border-top-color: var(--app-accent, #58a6ff);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .startup-error {
          width: 100%;
          padding: 16px;
          background: rgba(248, 81, 73, 0.1);
          border: 1px solid rgba(248, 81, 73, 0.3);
          border-radius: 8px;
          margin-top: 8px;
        }

        .error-message {
          font-size: 13px;
          color: var(--app-danger, #f85149);
          margin: 0 0 8px 0;
        }

        .warning-message {
          font-size: 12px;
          color: var(--app-warn, #d29922);
          margin: 0 0 16px 0;
        }

        .error-actions {
          display: flex;
          gap: 8px;
          justify-content: center;
        }

        .btn-primary {
          padding: 8px 20px;
          background: var(--app-accent, #58a6ff);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        }

        .btn-primary:hover {
          opacity: 0.85;
        }

        .btn-secondary {
          padding: 8px 20px;
          background: transparent;
          color: var(--app-text-muted, #6e7681);
          border: 1px solid var(--app-border, #30363d);
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: border-color 0.15s;
        }

        .btn-secondary:hover {
          border-color: var(--app-text-muted, #6e7681);
        }

        .startup-hint {
          font-size: 12px;
          color: var(--app-text-muted, #555566);
          margin: 8px 0 0 0;
        }
      `}</style>
    </div>
  );
}