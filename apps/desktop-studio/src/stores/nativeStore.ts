import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

interface NativeState {
  trayActive: boolean;
  shortcutsRegistered: boolean;
  notificationsEnabled: boolean;
  notificationPermission: boolean;
  _unlistenTray?: UnlistenFn;
  init: () => Promise<void>;
  sendNotification: (title: string, body: string) => Promise<void>;
  requestNotificationPermission: () => Promise<boolean>;
  cleanup: () => void;
}

export const useNativeStore = create<NativeState>((set, get) => ({
  trayActive: false,
  shortcutsRegistered: false,
  notificationsEnabled: false,
  notificationPermission: false,

  init: async () => {
    try {
      const { isPermissionGranted, requestPermission } = await import(
        "@tauri-apps/plugin-notification"
      );
      const { register } = await import("@tauri-apps/plugin-global-shortcut");

      // Clean up any previous tray listener before setting up a new one
      const prev = get()._unlistenTray;
      if (prev) prev();

      const granted = await isPermissionGranted();
      set({ notificationsEnabled: granted, notificationPermission: granted, trayActive: true });

      await register("CmdOrCtrl+Shift+N", () => {
        void emit("global-shortcut:new-run");
      });

      await register("CmdOrCtrl+Shift+H", () => {
        void emit("global-shortcut:toggle-visibility");
      });

      set({ shortcutsRegistered: true });

      const unlisten = await listen("tray:new-run", () => {
        void emit("global-shortcut:new-run");
      });
      set({ _unlistenTray: unlisten });
    } catch (err) {
      console.error("Failed to initialize native features:", err);
    }
  },

  cleanup: () => {
    const unlisten = get()._unlistenTray;
    if (unlisten) {
      unlisten();
      set({ _unlistenTray: undefined });
    }
  },

  sendNotification: async (title, body) => {
    if (!get().notificationsEnabled) return;
    try {
      await invoke("send_notification", { title, body });
    } catch (err) {
      console.error("Failed to send notification:", err);
    }
  },

  requestNotificationPermission: async () => {
    try {
      const { requestPermission, isPermissionGranted } = await import(
        "@tauri-apps/plugin-notification"
      );
      await requestPermission();
      const granted = await isPermissionGranted();
      set({ notificationsEnabled: granted, notificationPermission: granted });
      return granted;
    } catch {
      return false;
    }
  },
}));
