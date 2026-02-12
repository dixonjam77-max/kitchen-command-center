/**
 * API Client for React Native — uses AsyncStorage for token persistence.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = "http://localhost:8000/api/v1";

const TOKEN_KEY = "access_token";
const REFRESH_KEY = "refresh_token";

let _cachedToken: string | null = null;

export async function getAccessToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  _cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return _cachedToken;
}

export async function setTokens(access: string, refresh: string) {
  _cachedToken = access;
  await AsyncStorage.multiSet([
    [TOKEN_KEY, access],
    [REFRESH_KEY, refresh],
  ]);
}

export async function clearTokens() {
  _cachedToken = null;
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY]);
}

async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    await clearTokens();
  }

  return res;
}

export const api = {
  async get<T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    let url = path;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }
    const res = await apiFetch(url);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await apiFetch(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await apiFetch(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async del(path: string): Promise<void> {
    const res = await apiFetch(path, { method: "DELETE" });
    if (!res.ok && res.status !== 204) throw new Error(await res.text());
  },

  async upload<T = unknown>(path: string, formData: FormData): Promise<T> {
    const token = await getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
