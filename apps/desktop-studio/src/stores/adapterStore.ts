import { create } from "zustand";
import * as api from "../api/studioClient";

const HEALTH_POLL_INTERVAL_MS = 15_000;

interface AdapterState {
  connected: boolean;
  checking: boolean;
  authReady: boolean;
  authError: string | null;
  backendMode: string;
  activeBackend: string;
  hermesConnected: boolean;
  hermesUrl: string;
  storageAvailable: boolean;
  storageError: string | null;
  storageSchemaVersion: number;
  fallbackReason: string | null;
  lastCheckedAt: string | null;
  _pollTimer: ReturnType<typeof setInterval> | null;
  setConnected: (v: boolean) => void;
  checkConnection: () => Promise<boolean>;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useAdapterStore = create<AdapterState>((set, get) => ({
  connected: false,
  checking: false,
  authReady: false,
  authError: null,
  backendMode: "unknown",
  activeBackend: "unknown",
  hermesConnected: false,
  hermesUrl: "unknown",
  storageAvailable: false,
  storageError: null,
  storageSchemaVersion: 0,
  fallbackReason: null,
  lastCheckedAt: null,
  _pollTimer: null,
  setConnected: (v) => set({ connected: v }),

  startPolling: () => {
    const { _pollTimer, connected } = get();
    // Don't start polling if already connected or already polling
    if (_pollTimer || connected) return;

    const timer = setInterval(() => {
      const state = get();
      // Stop polling once connected
      if (state.connected) {
        state.stopPolling();
        return;
      }
      void state.checkConnection();
    }, HEALTH_POLL_INTERVAL_MS);

    set({ _pollTimer: timer });
  },

  stopPolling: () => {
    const { _pollTimer } = get();
    if (_pollTimer) {
      clearInterval(_pollTimer);
      set({ _pollTimer: null });
    }
  },

  checkConnection: async () => {
    const { checking } = get();
    if (checking) return false;

    set({ checking: true });
    try {
      const auth = await Promise.race([
        api.initializeAdapterAuth(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Auth timeout")), 5000)
        ),
      ]);

      if (!auth.authenticated) {
        const message = auth.error ?? "Adapter auth token is unavailable";
        set({
          connected: false,
          checking: false,
          authReady: false,
          authError: message,
          backendMode: "unknown",
          activeBackend: "unknown",
          hermesConnected: false,
          hermesUrl: "unknown",
          storageAvailable: false,
          storageError: null,
          storageSchemaVersion: 0,
          fallbackReason: message,
          lastCheckedAt: new Date().toISOString(),
        });
        get().startPolling();
        return false;
      }

      const health = await Promise.race([
        api.checkAdapterHealthDetailed(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), 5000)
        ),
      ]);

      const bs = health.backend_status;
      const storage = health.storage;
      set({
        connected: true,
        checking: false,
        authReady: true,
        authError: null,
        backendMode: bs?.backend_mode ?? health.backend_mode ?? "unknown",
        activeBackend: bs?.active_backend ?? bs?.backend_mode ?? health.backend_mode ?? "unknown",
        hermesConnected: bs?.hermes_connected ?? health.hermes_connected ?? false,
        hermesUrl: bs?.hermes_url ?? "unknown",
        storageAvailable: storage?.available ?? false,
        storageError: storage?.last_error ?? null,
        storageSchemaVersion: storage?.schema_version ?? 0,
        fallbackReason: bs?.fallback_reason ?? null,
        lastCheckedAt: new Date().toISOString(),
      });
      get().stopPolling();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Adapter connection failed";
      set({
        connected: false,
        checking: false,
        authReady: api.hasAdapterToken(),
        authError: null,
        backendMode: "unknown",
        activeBackend: "unknown",
        hermesConnected: false,
        hermesUrl: "unknown",
        storageAvailable: false,
        storageError: null,
        storageSchemaVersion: 0,
        fallbackReason: message,
        lastCheckedAt: new Date().toISOString(),
      });
      get().startPolling();
      return false;
    }
  },
}));
