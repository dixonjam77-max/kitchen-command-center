"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    checkAuth();
    setMounted(true);
  }, [checkAuth]);

  if (!mounted) return null;

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
