"use client";

import { useAuthStore } from "@/lib/stores/auth-store";
import { Navigation } from "@/components/shared/navigation";
import { api } from "@/lib/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Refrigerator, Wrench, BookOpen, Calendar, ShoppingCart, BarChart3,
  AlertTriangle, Clock, Trash2, Bell,
  Sparkles, Leaf, TrendingDown, RefreshCw,
} from "lucide-react";

/* ── Quick-link modules ─────────────────────────────────────────── */
const modules = [
  { href: "/pantry", label: "Pantry", icon: Refrigerator, color: "text-green-600" },
  { href: "/tools", label: "Tools", icon: Wrench, color: "text-blue-600" },
  { href: "/recipes", label: "Recipes", icon: BookOpen, color: "text-orange-600" },
  { href: "/meal-plan", label: "Meal Plan", icon: Calendar, color: "text-purple-600" },
  { href: "/grocery", label: "Grocery", icon: ShoppingCart, color: "text-teal-600" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, color: "text-rose-600" },
];

/* ── Types ──────────────────────────────────────────────────────── */
interface PantryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  freshness_status: string | null;
}

interface Notification {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

interface Suggestion {
  type: string;
  title: string;
  description: string;
  priority: string;
  related_items?: string[];
}

interface MealPlanEntry {
  id: string;
  plan_date: string;
  meal_type: string;
  custom_meal?: string;
  completed: boolean;
  recipe_id?: string;
}

export default function DashboardPage() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/login");
  }, [isLoading, isAuthenticated, router]);

  /* ── Freshness Dashboard (Use It or Lose It) ──────────────── */
  const freshnessQ = useQuery({
    queryKey: ["freshness-dashboard"],
    queryFn: () =>
      api.get<{
        use_today: PantryItem[];
        use_soon: PantryItem[];
        expired: PantryItem[];
        counts: { use_today: number; use_soon: number; expired: number };
      }>("/pantry/freshness-dashboard"),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  /* ── Today's Meals ────────────────────────────────────────── */
  const today = new Date().toISOString().split("T")[0];
  const todayMealsQ = useQuery({
    queryKey: ["today-meals", today],
    queryFn: () =>
      api.get<{ items: MealPlanEntry[] }>("/meal-plans", {
        start_date: today,
        end_date: today,
      }),
    enabled: isAuthenticated,
  });

  /* ── Quick Stats ──────────────────────────────────────────── */
  const pantryQ = useQuery({
    queryKey: ["pantry-count"],
    queryFn: () => api.get<{ total: number }>("/pantry", { limit: 1 }),
    enabled: isAuthenticated,
  });
  const recipesQ = useQuery({
    queryKey: ["recipes-count"],
    queryFn: () => api.get<{ total: number }>("/recipes", { limit: 1 }),
    enabled: isAuthenticated,
  });
  const groceryQ = useQuery({
    queryKey: ["grocery-active"],
    queryFn: () =>
      api.get<{
        items: { id: string; status: string; name: string }[];
      }>("/grocery"),
    enabled: isAuthenticated,
  });

  /* ── Notifications ────────────────────────────────────────── */
  const notificationsQ = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api.get<{ notifications: Notification[]; unread_count: number }>(
        "/ai/notifications"
      ),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  const markAllReadMut = useMutation({
    mutationFn: () => api.post("/ai/notifications/mark-all-read"),
    onSuccess: () => {
      notificationsQ.refetch();
    },
  });

  /* ── Smart Suggestions (AI) ───────────────────────────────── */
  const suggestionsQ = useQuery({
    queryKey: ["smart-suggestions"],
    queryFn: () =>
      api.post<{ suggestions: Suggestion[]; tip_of_the_day: string }>(
        "/ai/smart-suggestions"
      ),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  /* ── Freshness Scan ───────────────────────────────────────── */
  const scanMut = useMutation({
    mutationFn: () => api.post("/ai/freshness-scan"),
    onSuccess: () => {
      freshnessQ.refetch();
    },
  });

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        Loading...
      </div>
    );
  }

  const fd = freshnessQ.data;
  const todayMeals = todayMealsQ.data?.items || [];
  const activeGrocery = (groceryQ.data?.items || []).filter(
    (l) => l.status === "active" || l.status === "shopping"
  );
  const notifs = notificationsQ.data?.notifications || [];
  const unread = notificationsQ.data?.unread_count || 0;
  const suggestions = suggestionsQ.data?.suggestions || [];
  const tip = suggestionsQ.data?.tip_of_the_day;

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8 overflow-auto max-h-screen">
        <div className="max-w-6xl">
          {/* Header with notifications */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">
                Welcome back{user?.name ? `, ${user.name}` : ""}
              </h2>
              <p className="text-muted-foreground">
                Your kitchen command center at a glance.
              </p>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-lg hover:bg-accent transition-colors"
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 bg-card border rounded-lg shadow-lg z-50 max-h-96 overflow-auto">
                  <div className="flex items-center justify-between p-3 border-b">
                    <span className="font-semibold text-sm">Notifications</span>
                    {unread > 0 && (
                      <button
                        onClick={() => markAllReadMut.mutate()}
                        className="text-xs text-primary hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifs.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      No notifications yet
                    </p>
                  ) : (
                    notifs.slice(0, 15).map((n) => (
                      <div
                        key={n.id}
                        className={`p-3 border-b text-sm ${
                          !n.read ? "bg-accent/50" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {n.severity === "critical" && (
                            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                          )}
                          {n.severity === "high" && (
                            <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                          )}
                          {n.severity === "medium" && (
                            <Clock className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                          )}
                          {n.severity === "low" && (
                            <Bell className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                          )}
                          <div>
                            <p className="font-medium">{n.title}</p>
                            <p className="text-muted-foreground text-xs mt-0.5">
                              {n.message}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* AI Tip of the Day */}
          {tip && (
            <div className="mb-6 p-4 rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-purple-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-300">
                    AI Tip of the Day
                  </p>
                  <p className="text-sm text-purple-700 dark:text-purple-400 mt-1">
                    {tip}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Use It or Lose It ═══ */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Use It or Lose It
              </h3>
              <button
                onClick={() => scanMut.mutate()}
                disabled={scanMut.isPending}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    scanMut.isPending ? "animate-spin" : ""
                  }`}
                />
                {scanMut.isPending ? "Scanning..." : "Run freshness scan"}
              </button>
            </div>
            {freshnessQ.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading freshness data...
              </p>
            ) : fd &&
              (fd.counts.use_today > 0 ||
                fd.counts.use_soon > 0 ||
                fd.counts.expired > 0) ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Use Today */}
                <div className="rounded-lg border-2 border-red-300 bg-red-50 dark:bg-red-950/20 p-4">
                  <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Use Today ({fd.counts.use_today})
                  </h4>
                  {fd.use_today.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nothing urgent!
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {fd.use_today.slice(0, 5).map((item) => (
                        <li
                          key={item.id}
                          className="text-sm flex items-center justify-between"
                        >
                          <Link href="/pantry" className="hover:underline">
                            {item.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Use Soon */}
                <div className="rounded-lg border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-4">
                  <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    Use This Week ({fd.counts.use_soon})
                  </h4>
                  {fd.use_soon.length === 0 ? (
                    <p className="text-xs text-muted-foreground">All good!</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {fd.use_soon.slice(0, 5).map((item) => (
                        <li
                          key={item.id}
                          className="text-sm flex items-center justify-between"
                        >
                          <Link href="/pantry" className="hover:underline">
                            {item.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Expired */}
                <div className="rounded-lg border-2 border-gray-300 bg-gray-50 dark:bg-gray-950/20 p-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-gray-500" />
                    Expired ({fd.counts.expired})
                  </h4>
                  {fd.expired.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No expired items
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {fd.expired.slice(0, 5).map((item) => (
                        <li
                          key={item.id}
                          className="text-sm flex items-center justify-between"
                        >
                          <span className="line-through text-muted-foreground">
                            {item.name}
                          </span>
                          <Link
                            href="/pantry"
                            className="text-xs text-red-600 hover:underline flex items-center gap-0.5"
                          >
                            <Trash2 className="h-3 w-3" /> Log waste
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground p-4 bg-accent/30 rounded-lg">
                No items needing attention. Your pantry is looking great!
              </p>
            )}
          </div>

          {/* ═══ Today's Meals + Quick Stats ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Today's Meals */}
            <div className="rounded-lg border p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-500" />
                Today&apos;s Meals
              </h3>
              {todayMeals.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  <p>No meals planned for today.</p>
                  <Link
                    href="/meal-plan"
                    className="text-primary hover:underline text-xs mt-1 inline-block"
                  >
                    Plan something &rarr;
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2">
                  {todayMeals.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="capitalize text-xs font-medium text-muted-foreground w-16">
                          {m.meal_type}
                        </span>
                        <span>{m.custom_meal || "Planned meal"}</span>
                      </div>
                      {!m.completed && (
                        <Link
                          href="/meal-plan"
                          className="text-xs text-primary hover:underline"
                        >
                          Start cooking
                        </Link>
                      )}
                      {m.completed && (
                        <span className="text-xs text-green-600">Done</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Quick Stats */}
            <div className="rounded-lg border p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-rose-500" />
                Quick Stats
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-accent/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">
                    {pantryQ.data?.total || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Pantry Items</p>
                </div>
                <div className="bg-accent/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">
                    {recipesQ.data?.total || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Recipes Saved
                  </p>
                </div>
                <div className="bg-accent/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">
                    {todayMeals.filter((m) => !m.completed).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Meals Today</p>
                </div>
                <div className="bg-accent/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{activeGrocery.length}</p>
                  <p className="text-xs text-muted-foreground">Active Lists</p>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ AI Smart Suggestions ═══ */}
          {suggestions.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Smart Suggestions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suggestions.slice(0, 4).map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {s.type === "freshness" && (
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                        )}
                        {s.type === "meal_plan" && (
                          <Calendar className="h-4 w-4 text-purple-500" />
                        )}
                        {s.type === "waste" && (
                          <TrendingDown className="h-4 w-4 text-rose-500" />
                        )}
                        {s.type === "seasonal" && (
                          <Leaf className="h-4 w-4 text-green-500" />
                        )}
                        {s.type === "variety" && (
                          <Sparkles className="h-4 w-4 text-blue-500" />
                        )}
                        {s.type === "efficiency" && (
                          <RefreshCw className="h-4 w-4 text-teal-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {s.description}
                        </p>
                        {s.priority === "high" && (
                          <span className="inline-block mt-1.5 text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                            High priority
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Module Quick Links ═══ */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Modules</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {modules.map(({ href, label, icon: Icon, color }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center p-4 rounded-lg border hover:border-primary hover:shadow-sm transition-all text-center"
                >
                  <Icon className={`h-7 w-7 ${color} mb-2`} />
                  <span className="text-sm font-medium">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
