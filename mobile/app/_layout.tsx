import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useOfflineStore } from "@/lib/stores/offline-store";
import { registerForPushNotifications } from "@/lib/notifications";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
});

export default function RootLayout() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const loadOffline = useOfflineStore((s) => s.loadFromStorage);
  const setOnline = useOfflineStore((s) => s.setOnline);

  useEffect(() => {
    checkAuth();
    loadOffline();
    registerForPushNotifications();

    // Monitor network state for offline grocery support
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected ?? true);
    });

    return () => unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ presentation: "modal" }} />
        <Stack.Screen name="register" options={{ presentation: "modal" }} />
        <Stack.Screen name="pantry/[id]" options={{ headerShown: true, title: "Pantry Item" }} />
        <Stack.Screen name="recipes/[id]" options={{ headerShown: true, title: "Recipe" }} />
        <Stack.Screen name="recipes/new" options={{ headerShown: true, title: "New Recipe" }} />
        <Stack.Screen name="grocery/[id]" options={{ headerShown: true, title: "Grocery List" }} />
        <Stack.Screen name="scan" options={{ presentation: "fullScreenModal", headerShown: true, title: "Scanner" }} />
      </Stack>
    </QueryClientProvider>
  );
}
