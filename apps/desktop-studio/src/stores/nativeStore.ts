import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";

interface NativeState {
  trayActive: boolean;
  shortcutsRegistered: boolean;
  notificationsEnabled: boolean;
  notificationPermission: boolean;
  init: () => Promise<void>;
  sendNotification: (title: string, body: string) => Promise<void>;
  requestNotificationPermission: () => Promise<boolean>;
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

      const granted = await isPermissionGranted();
      set({ notificationsEnabled: granted, notificationPermission: granted, trayActive: true });

      await register("CmdOrCtrl+Shift+N", () => {
        void emit("global-shortcut:new-run");
      });

      await register("CmdOrCtrl+Shift+H", () => {
        void emit("global-shortcut:toggle-visibility");
      });

      set({ shortcutsRegistered: true });

      await listen("tray:new-run", () => {
        void emit("global-shortcut:new-run");
      });
    } catch (err) {
      console.error("Failed to initialize native features:", err);
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
