import { create } from "zustand";
import * as api from "../api/studioClient";

interface Profile {
  id: string;
  name: string;
  path: string;
  active: boolean;
  has_config: boolean;
  has_state_db: boolean;
  session_count: number;
}

interface ProfileState {
  profiles: Profile[];
  activeProfile: Profile | null;
  profileCount: number;
  loaded: boolean;
  error: string | null;
  activateError: string | null;
  loadProfiles: () => Promise<void>;
  activateProfile: (profileId: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  profileCount: 0,
  loaded: false,
  error: null,
  activateError: null,

  loadProfiles: async () => {
    try {
      const [profiles, active] = await Promise.all([
        api.getProfiles(),
        api.getActiveProfile().catch(() => null),
      ]);
      const profileList = profiles.map((p) => ({
        id: p.name,
        name: p.name,
        path: p.path,
        active: p.name === active?.name,
        has_config: false,
        has_state_db: false,
        session_count: 0,
      }));
      set({
        profiles: profileList,
        activeProfile: active ? { id: active.name, name: active.name, path: active.path, active: true, has_config: false, has_state_db: false, session_count: 0 } : null,
        profileCount: profileList.length,
        loaded: true,
        error: null,
      });
    } catch (err) {
      set({ loaded: true, error: err instanceof Error ? err.message : "Failed to load profiles" });
    }
  },

  activateProfile: async (profileId: string) => {
    set({ activateError: null });
    try {
      await api.activateProfile(profileId);
      await get().loadProfiles();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to activate profile";
      if (msg.includes("501") || msg.includes("not_implemented") || msg.includes("not implemented")) {
        set({ activateError: "Profile switching is not implemented yet" });
      } else {
        set({ activateError: msg });
      }
    }
  },
}));
