import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { colors, spacing, fontSize, borderRadius } from "@/lib/theme";

/* ── Types ──────────────────────────────────────────────────────── */

interface PantryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  freshness_status: string | null;
}

interface FreshnessDashboard {
  use_today: PantryItem[];
  use_soon: PantryItem[];
  expired: PantryItem[];
  counts: { use_today: number; use_soon: number; expired: number };
}

interface MealPlanEntry {
  id: string;
  plan_date: string;
  meal_type: string;
  custom_meal: string | null;
  completed: boolean;
  recipe_id: string | null;
}

interface Suggestion {
  type: string;
  title: string;
  description: string;
  priority: string;
  related_items?: string[];
}

interface SmartSuggestionsResponse {
  suggestions: Suggestion[];
  tip_of_the_day?: string;
}

/* ── Helpers ────────────────────────────────────────────────────── */

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

const SUGGESTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  freshness: "alert-circle",
  meal_plan: "calendar",
  waste: "trending-down",
  seasonal: "leaf",
  variety: "sparkles",
  efficiency: "refresh",
};

const SUGGESTION_COLORS: Record<string, string> = {
  freshness: colors.useSoon,
  meal_plan: colors.purple.text,
  waste: colors.rose.text,
  seasonal: colors.green.text,
  variety: colors.blue.text,
  efficiency: colors.teal.text,
};

/* ── Component ──────────────────────────────────────────────────── */

export default function DashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const today = getTodayISO();

  /* ── Queries ──────────────────────────────────────────────── */

  const freshnessQ = useQuery({
    queryKey: ["freshness-dashboard"],
    queryFn: () => api.get<FreshnessDashboard>("/pantry/freshness-dashboard"),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  const todayMealsQ = useQuery({
    queryKey: ["today-meals", today],
    queryFn: () =>
      api.get<MealPlanEntry[]>("/meal-plans", {
        start_date: today,
        end_date: today,
      }),
    enabled: isAuthenticated,
  });

  const pantryCountQ = useQuery({
    queryKey: ["pantry-count"],
    queryFn: () => api.get<{ total: number }>("/pantry", { limit: 1 }),
    enabled: isAuthenticated,
  });

  const recipesCountQ = useQuery({
    queryKey: ["recipes-count"],
    queryFn: () => api.get<{ total: number }>("/recipes", { limit: 1 }),
    enabled: isAuthenticated,
  });

  const groceryQ = useQuery({
    queryKey: ["grocery-active"],
    queryFn: () =>
      api.get<{ id: string; status: string; name: string }[]>("/grocery"),
    enabled: isAuthenticated,
  });

  const suggestionsQ = useQuery({
    queryKey: ["smart-suggestions"],
    queryFn: () => api.post<SmartSuggestionsResponse>("/ai/smart-suggestions"),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  /* ── Mutations ────────────────────────────────────────────── */

  const scanMut = useMutation({
    mutationFn: () => api.post("/ai/freshness-scan"),
    onSuccess: () => {
      freshnessQ.refetch();
    },
  });

  /* ── Pull-to-refresh ──────────────────────────────────────── */

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["freshness-dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["today-meals"] }),
      queryClient.invalidateQueries({ queryKey: ["pantry-count"] }),
      queryClient.invalidateQueries({ queryKey: ["recipes-count"] }),
      queryClient.invalidateQueries({ queryKey: ["grocery-active"] }),
      queryClient.invalidateQueries({ queryKey: ["smart-suggestions"] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  /* ── Derived data ─────────────────────────────────────────── */

  const fd = freshnessQ.data;
  const todayMeals = todayMealsQ.data || [];
  const activeGrocery = (groceryQ.data || []).filter(
    (l) => l.status === "active" || l.status === "shopping"
  );
  const suggestions = suggestionsQ.data?.suggestions || [];
  const tip = suggestionsQ.data?.tip_of_the_day;

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* ═══ Welcome Header ═══ */}
      <View style={styles.header}>
        <Text style={styles.welcomeText}>
          Welcome back{user?.name ? `, ${user.name}` : ""}
        </Text>
        <Text style={styles.subtitle}>
          Your kitchen command center at a glance.
        </Text>
      </View>

      {/* ═══ AI Tip of the Day ═══ */}
      {tip ? (
        <View style={styles.tipCard}>
          <Ionicons name="sparkles" size={18} color={colors.purple.text} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.tipTitle}>AI Tip of the Day</Text>
            <Text style={styles.tipBody}>{tip}</Text>
          </View>
        </View>
      ) : null}

      {/* ═══ Use It or Lose It ═══ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="alert-circle" size={20} color={colors.useSoon} />
            <Text style={styles.sectionTitle}>Use It or Lose It</Text>
          </View>
          <TouchableOpacity
            onPress={() => scanMut.mutate()}
            disabled={scanMut.isPending}
            style={styles.scanButton}
          >
            {scanMut.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh" size={14} color={colors.primary} />
            )}
            <Text style={styles.scanButtonText}>
              {scanMut.isPending ? "Scanning..." : "Run Freshness Scan"}
            </Text>
          </TouchableOpacity>
        </View>

        {freshnessQ.isLoading ? (
          <ActivityIndicator
            size="small"
            color={colors.mutedForeground}
            style={{ marginTop: spacing.md }}
          />
        ) : fd &&
          (fd.counts.use_today > 0 ||
            fd.counts.use_soon > 0 ||
            fd.counts.expired > 0) ? (
          <View style={styles.freshnessCards}>
            {/* Use Today */}
            <TouchableOpacity
              style={[
                styles.freshnessCard,
                { borderColor: colors.red.border, backgroundColor: colors.red.bg },
              ]}
              onPress={() => router.push("/(tabs)/pantry")}
            >
              <View style={styles.freshnessCardHeader}>
                <View
                  style={[styles.dot, { backgroundColor: colors.useToday }]}
                />
                <Text style={[styles.freshnessLabel, { color: colors.red.text }]}>
                  Use Today ({fd.counts.use_today})
                </Text>
              </View>
              {fd.use_today.length === 0 ? (
                <Text style={styles.emptyHint}>Nothing urgent!</Text>
              ) : (
                fd.use_today.slice(0, 3).map((item) => (
                  <View key={item.id} style={styles.freshnessItem}>
                    <Text style={styles.freshnessItemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.freshnessItemQty}>
                      {item.quantity} {item.unit}
                    </Text>
                  </View>
                ))
              )}
            </TouchableOpacity>

            {/* Use Soon */}
            <TouchableOpacity
              style={[
                styles.freshnessCard,
                {
                  borderColor: colors.orange.border,
                  backgroundColor: colors.orange.bg,
                },
              ]}
              onPress={() => router.push("/(tabs)/pantry")}
            >
              <View style={styles.freshnessCardHeader}>
                <View
                  style={[styles.dot, { backgroundColor: colors.useSoon }]}
                />
                <Text
                  style={[styles.freshnessLabel, { color: colors.orange.text }]}
                >
                  Use Soon ({fd.counts.use_soon})
                </Text>
              </View>
              {fd.use_soon.length === 0 ? (
                <Text style={styles.emptyHint}>All good!</Text>
              ) : (
                fd.use_soon.slice(0, 3).map((item) => (
                  <View key={item.id} style={styles.freshnessItem}>
                    <Text style={styles.freshnessItemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.freshnessItemQty}>
                      {item.quantity} {item.unit}
                    </Text>
                  </View>
                ))
              )}
            </TouchableOpacity>

            {/* Expired */}
            <TouchableOpacity
              style={[
                styles.freshnessCard,
                {
                  borderColor: colors.gray.border,
                  backgroundColor: colors.gray.bg,
                },
              ]}
              onPress={() => router.push("/(tabs)/pantry")}
            >
              <View style={styles.freshnessCardHeader}>
                <View
                  style={[styles.dot, { backgroundColor: colors.expired }]}
                />
                <Text
                  style={[styles.freshnessLabel, { color: colors.gray.text }]}
                >
                  Expired ({fd.counts.expired})
                </Text>
              </View>
              {fd.expired.length === 0 ? (
                <Text style={styles.emptyHint}>No expired items</Text>
              ) : (
                fd.expired.slice(0, 3).map((item) => (
                  <View key={item.id} style={styles.freshnessItem}>
                    <Text
                      style={[
                        styles.freshnessItemName,
                        { textDecorationLine: "line-through", color: colors.mutedForeground },
                      ]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text style={[styles.freshnessItemQty, { color: colors.destructive }]}>
                      Log waste
                    </Text>
                  </View>
                ))
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No items needing attention. Your pantry is looking great!
            </Text>
          </View>
        )}
      </View>

      {/* ═══ Today's Meals ═══ */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="calendar" size={16} color={colors.purple.text} />
          <Text style={styles.cardTitle}>Today's Meals</Text>
        </View>
        {todayMeals.length === 0 ? (
          <Text style={styles.mutedText}>No meals planned for today.</Text>
        ) : (
          todayMeals.map((m) => (
            <View key={m.id} style={styles.mealRow}>
              <View style={styles.mealLeft}>
                <Text style={styles.mealType}>{m.meal_type}</Text>
                <Text style={styles.mealName}>
                  {m.custom_meal || "Planned meal"}
                </Text>
              </View>
              {m.completed ? (
                <Text style={styles.mealDone}>Done</Text>
              ) : (
                <Text style={styles.mealCook}>Start cooking</Text>
              )}
            </View>
          ))
        )}
      </View>

      {/* ═══ Quick Stats ═══ */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="stats-chart" size={16} color={colors.rose.text} />
          <Text style={styles.cardTitle}>Quick Stats</Text>
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {pantryCountQ.data?.total ?? 0}
            </Text>
            <Text style={styles.statLabel}>Pantry Items</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {recipesCountQ.data?.total ?? 0}
            </Text>
            <Text style={styles.statLabel}>Recipes Saved</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {todayMeals.filter((m) => !m.completed).length}
            </Text>
            <Text style={styles.statLabel}>Meals Today</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{activeGrocery.length}</Text>
            <Text style={styles.statLabel}>Active Lists</Text>
          </View>
        </View>
      </View>

      {/* ═══ Smart Suggestions ═══ */}
      {suggestions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="sparkles" size={20} color={colors.purple.text} />
            <Text style={styles.sectionTitle}>Smart Suggestions</Text>
          </View>
          {suggestions.slice(0, 4).map((s, i) => (
            <View key={i} style={styles.suggestionCard}>
              <Ionicons
                name={SUGGESTION_ICONS[s.type] || "bulb"}
                size={18}
                color={SUGGESTION_COLORS[s.type] || colors.mutedForeground}
              />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.suggestionTitle}>{s.title}</Text>
                <Text style={styles.suggestionDesc}>{s.description}</Text>
                {s.priority === "high" && (
                  <View style={styles.highBadge}>
                    <Text style={styles.highBadgeText}>High priority</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Bottom spacing */}
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingTop: spacing.xl,
  },

  /* Header */
  header: {
    marginBottom: spacing.lg,
  },
  welcomeText: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.foreground,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },

  /* Tip card */
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.purple.border,
    backgroundColor: colors.purple.bg,
    marginBottom: spacing.lg,
  },
  tipTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.purple.text,
  },
  tipBody: {
    fontSize: fontSize.sm,
    color: colors.purple.text,
    marginTop: spacing.xs,
  },

  /* Section */
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.foreground,
  },

  /* Scan button */
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  scanButtonText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "500",
  },

  /* Freshness cards */
  freshnessCards: {
    gap: spacing.sm,
  },
  freshnessCard: {
    borderWidth: 2,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  freshnessCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  freshnessLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  freshnessItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  freshnessItemName: {
    fontSize: fontSize.sm,
    color: colors.foreground,
    flex: 1,
  },
  freshnessItemQty: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginLeft: spacing.sm,
  },

  /* Empty states */
  emptyHint: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  emptyState: {
    padding: spacing.md,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
  },
  emptyStateText: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },

  /* Cards */
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.foreground,
  },

  /* Meal rows */
  mealRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  mealLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  mealType: {
    fontSize: fontSize.xs,
    fontWeight: "500",
    color: colors.mutedForeground,
    textTransform: "capitalize",
    width: 60,
  },
  mealName: {
    fontSize: fontSize.sm,
    color: colors.foreground,
    flex: 1,
  },
  mealDone: {
    fontSize: fontSize.xs,
    color: colors.fresh,
    fontWeight: "500",
  },
  mealCook: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "500",
  },
  mutedText: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },

  /* Quick stats */
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  statBox: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  statNumber: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.foreground,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },

  /* Suggestions */
  suggestionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.card,
  },
  suggestionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.foreground,
  },
  suggestionDesc: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  highBadge: {
    marginTop: spacing.xs,
    backgroundColor: colors.red.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    alignSelf: "flex-start",
  },
  highBadgeText: {
    fontSize: fontSize.xs,
    color: colors.red.text,
    fontWeight: "500",
  },
});
