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
  activatingProfileId: string | null;
  loadProfiles: () => Promise<void>;
  activateProfile: (profileId: string) => Promise<void>;
}

function normalizeProfile(profile: api.ProfileInfo, activeName?: string | null): Profile {
  const id = profile.id || profile.name;
  const active = Boolean(profile.active ?? profile.is_active ?? (activeName ? profile.name === activeName || id === activeName : false));
  return {
    id,
    name: profile.name,
    path: profile.path,
    active,
    has_config: Boolean(profile.has_config),
    has_state_db: Boolean(profile.has_state_db),
    session_count: typeof profile.session_count === "number" ? profile.session_count : 0,
  };
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  profileCount: 0,
  loaded: false,
  error: null,
  activateError: null,
  activatingProfileId: null,

  loadProfiles: async () => {
    try {
      const [profiles, active] = await Promise.all([
        api.getProfiles(),
        api.getActiveProfile().catch(() => null),
      ]);
      const activeName = active?.id || active?.name || null;
      const profileList = profiles.map((p) => normalizeProfile(p, activeName));
      const normalizedActive = active ? normalizeProfile(active, activeName) : profileList.find((p) => p.active) ?? null;
      set({
        profiles: profileList,
        activeProfile: normalizedActive ? { ...normalizedActive, active: true } : null,
        profileCount: profileList.length,
        loaded: true,
        error: null,
      });
    } catch (err) {
      set({ loaded: true, error: err instanceof Error ? err.message : "Failed to load profiles" });
    }
  },

  activateProfile: async (profileId: string) => {
    set({ activateError: null, activatingProfileId: profileId });
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
    } finally {
      set({ activatingProfileId: null });
    }
  },
}));
