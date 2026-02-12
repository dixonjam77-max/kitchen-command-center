/**
 * Auth store for React Native — mirrors web's Zustand store with AsyncStorage.
 */
import { create } from "zustand";
import { api, setTokens, clearTokens, getAccessToken } from "../api-client";

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const data = await api.post<{
      access_token: string;
      refresh_token: string;
      user: User;
    }>("/auth/login", { email, password });
    await setTokens(data.access_token, data.refresh_token);
    set({ user: data.user, isAuthenticated: true });
  },

  register: async (email, name, password) => {
    const data = await api.post<{
      access_token: string;
      refresh_token: string;
      user: User;
    }>("/auth/register", { email, name, password });
    await setTokens(data.access_token, data.refresh_token);
    set({ user: data.user, isAuthenticated: true });
  },

  logout: async () => {
    await clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }
      const user = await api.get<User>("/auth/me");
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
