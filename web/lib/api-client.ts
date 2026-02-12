const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearTokens();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  return res;
}

export const api = {
  async get<T = unknown>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
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
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    // Don't set Content-Type — browser sets multipart boundary automatically
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (res.status === 401) {
      clearTokens();
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
