import { create } from "zustand";
import { api, setTokens, clearTokens } from "../api-client";

interface User {
  id: string;
  email: string;
  name: string | null;
  preferences: Record<string, unknown>;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const data = await api.post<{ access_token: string; refresh_token: string }>(
      "/auth/login",
      { email, password }
    );
    setTokens(data.access_token, data.refresh_token);
    const user = await api.get<User>("/auth/me");
    set({ user, isAuthenticated: true });
  },

  register: async (email, name, password) => {
    const data = await api.post<{ access_token: string; refresh_token: string }>(
      "/auth/register",
      { email, name, password }
    );
    setTokens(data.access_token, data.refresh_token);
    const user = await api.get<User>("/auth/me");
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const user = await api.get<User>("/auth/me");
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
