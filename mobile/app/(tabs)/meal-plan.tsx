import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  FlatList,
  RefreshControl,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { colors, spacing, fontSize, borderRadius } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MealPlan {
  id: string;
  plan_date: string;
  meal_type: string;
  recipe_id: string | null;
  custom_meal: string | null;
  servings: number | null;
  notes: string | null;
  completed: boolean;
  completed_at: string | null;
}

interface RecipeListItem {
  id: string;
  name: string;
  cuisine: string | null;
  total_time_minutes: number | null;
  difficulty: string | null;
}

interface RecipeSearchResult {
  items: RecipeListItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

const MEAL_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  breakfast: { bg: colors.yellow.bg, text: colors.yellow.text },
  lunch: { bg: colors.green.bg, text: colors.green.text },
  dinner: { bg: colors.blue.bg, text: colors.blue.text },
  snack: { bg: colors.purple.bg, text: colors.purple.text },
};

const MEAL_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  breakfast: "sunny-outline",
  lunch: "restaurant-outline",
  dinner: "moon-outline",
  snack: "cafe-outline",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDayHeader(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);

  if (toDateString(d) === toDateString(today)) return "Today";
  if (toDateString(d) === toDateString(tomorrow)) return "Tomorrow";

  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Meal Card Component
// ---------------------------------------------------------------------------

function MealCard({
  meal,
  onComplete,
}: {
  meal: MealPlan;
  onComplete: () => void;
}) {
  const mealColor = MEAL_TYPE_COLORS[meal.meal_type] ?? MEAL_TYPE_COLORS.snack;
  const mealIcon = MEAL_TYPE_ICONS[meal.meal_type] ?? "restaurant-outline";
  const displayName = meal.custom_meal ?? "Planned meal";

  return (
    <View style={[styles.mealCard, meal.completed && styles.mealCardCompleted]}>
      <View style={styles.mealCardLeft}>
        <View
          style={[styles.mealTypeBadge, { backgroundColor: mealColor.bg }]}
        >
          <Ionicons name={mealIcon} size={14} color={mealColor.text} />
          <Text style={[styles.mealTypeText, { color: mealColor.text }]}>
            {formatLabel(meal.meal_type)}
          </Text>
        </View>
        <Text
          style={[
            styles.mealName,
            meal.completed && styles.mealNameCompleted,
          ]}
          numberOfLines={2}
        >
          {displayName}
        </Text>
        {meal.servings && (
          <Text style={styles.mealServings}>
            {meal.servings} serving{meal.servings > 1 ? "s" : ""}
          </Text>
        )}
        {meal.notes && (
          <Text style={styles.mealNotes} numberOfLines={1}>
            {meal.notes}
          </Text>
        )}
      </View>
      {!meal.completed ? (
        <TouchableOpacity style={styles.completeBtn} onPress={onComplete}>
          <Ionicons
            name="checkmark-circle-outline"
            size={28}
            color={colors.fresh}
          />
        </TouchableOpacity>
      ) : (
        <Ionicons name="checkmark-circle" size={28} color={colors.fresh} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Add Meal Modal
// ---------------------------------------------------------------------------

function AddMealModal({
  visible,
  initialDate,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initialDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mealType, setMealType] = useState<string>("dinner");
  const [mealDate, setMealDate] = useState(initialDate);
  const [mode, setMode] = useState<"recipe" | "custom">("recipe");
  const [customMeal, setCustomMeal] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeListItem | null>(
    null
  );
  const [servings, setServings] = useState("4");

  // Search recipes for the picker
  const { data: searchResults, isLoading: searching } =
    useQuery<RecipeSearchResult>({
      queryKey: ["recipeSearch", recipeSearch],
      queryFn: () =>
        api.get<RecipeSearchResult>("/recipes", {
          search: recipeSearch,
          limit: 20,
        }),
      enabled: mode === "recipe" && recipeSearch.length >= 2,
    });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post("/meal-plans", body),
    onSuccess: () => {
      onSaved();
      onClose();
      resetForm();
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const resetForm = () => {
    setMealType("dinner");
    setMode("recipe");
    setCustomMeal("");
    setRecipeSearch("");
    setSelectedRecipe(null);
    setServings("4");
  };

  const handleSave = () => {
    const body: Record<string, unknown> = {
      plan_date: mealDate,
      meal_type: mealType,
      servings: parseInt(servings, 10) || 4,
    };

    if (mode === "recipe" && selectedRecipe) {
      body.recipe_id = selectedRecipe.id;
      body.custom_meal = selectedRecipe.name;
    } else if (mode === "custom" && customMeal.trim()) {
      body.custom_meal = customMeal.trim();
    } else {
      Alert.alert("Missing", "Please select a recipe or enter a custom meal.");
      return;
    }

    mutation.mutate(body);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Meal</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
          >
            {/* Date */}
            <Text style={styles.fieldLabel}>Date</Text>
            <TextInput
              style={styles.input}
              value={mealDate}
              onChangeText={setMealDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
            />

            {/* Meal Type */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
              Meal Type
            </Text>
            <View style={styles.mealTypeRow}>
              {MEAL_TYPES.map((mt) => {
                const active = mealType === mt;
                const c = MEAL_TYPE_COLORS[mt];
                return (
                  <TouchableOpacity
                    key={mt}
                    style={[
                      styles.mealTypeChip,
                      active && { backgroundColor: c.bg, borderColor: c.text },
                    ]}
                    onPress={() => setMealType(mt)}
                  >
                    <Text
                      style={[
                        styles.mealTypeChipText,
                        active && { color: c.text },
                      ]}
                    >
                      {formatLabel(mt)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Mode toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  mode === "recipe" && styles.modeBtnActive,
                ]}
                onPress={() => setMode("recipe")}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    mode === "recipe" && styles.modeBtnTextActive,
                  ]}
                >
                  Pick Recipe
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  mode === "custom" && styles.modeBtnActive,
                ]}
                onPress={() => setMode("custom")}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    mode === "custom" && styles.modeBtnTextActive,
                  ]}
                >
                  Custom Meal
                </Text>
              </TouchableOpacity>
            </View>

            {mode === "recipe" ? (
              <View>
                {selectedRecipe ? (
                  <View style={styles.selectedRecipe}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedRecipeName}>
                        {selectedRecipe.name}
                      </Text>
                      {selectedRecipe.cuisine && (
                        <Text style={styles.selectedRecipeMeta}>
                          {formatLabel(selectedRecipe.cuisine)}
                          {selectedRecipe.total_time_minutes &&
                            ` - ${selectedRecipe.total_time_minutes} min`}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelectedRecipe(null)}
                    >
                      <Ionicons
                        name="close-circle"
                        size={22}
                        color={colors.mutedForeground}
                      />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <TextInput
                      style={styles.input}
                      placeholder="Search recipes..."
                      placeholderTextColor={colors.mutedForeground}
                      value={recipeSearch}
                      onChangeText={setRecipeSearch}
                    />
                    {searching && (
                      <ActivityIndicator
                        style={{ marginTop: spacing.sm }}
                        color={colors.primary}
                      />
                    )}
                    {searchResults?.items && searchResults.items.length > 0 && (
                      <View style={styles.searchResults}>
                        {searchResults.items.map((r) => (
                          <TouchableOpacity
                            key={r.id}
                            style={styles.searchResultItem}
                            onPress={() => {
                              setSelectedRecipe(r);
                              setRecipeSearch("");
                            }}
                          >
                            <Text style={styles.searchResultName}>
                              {r.name}
                            </Text>
                            <Text style={styles.searchResultMeta}>
                              {r.cuisine ? formatLabel(r.cuisine) : ""}
                              {r.total_time_minutes
                                ? ` - ${r.total_time_minutes}m`
                                : ""}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="e.g. Leftovers, Eating out..."
                placeholderTextColor={colors.mutedForeground}
                value={customMeal}
                onChangeText={setCustomMeal}
              />
            )}

            {/* Servings */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
              Servings
            </Text>
            <TextInput
              style={styles.input}
              value={servings}
              onChangeText={setServings}
              keyboardType="numeric"
              placeholder="4"
              placeholderTextColor={colors.mutedForeground}
            />
          </ScrollView>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSave}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryButtonText}>Add Meal</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function MealPlanScreen() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [addMealDate, setAddMealDate] = useState("");

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const startStr = toDateString(weekStart);
  const endStr = toDateString(weekEnd);

  const {
    data: meals,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<MealPlan[]>({
    queryKey: ["mealPlans", startStr, endStr],
    queryFn: () =>
      api.get<MealPlan[]>("/meal-plans", {
        start_date: startStr,
        end_date: endStr,
      }),
  });

  // Group meals by date
  const daysData = useMemo(() => {
    const days: { date: Date; dateStr: string; meals: MealPlan[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const ds = toDateString(d);
      const dayMeals = (meals ?? [])
        .filter((m) => m.plan_date === ds)
        .sort((a, b) => {
          const order = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
          return (
            (order[a.meal_type as keyof typeof order] ?? 4) -
            (order[b.meal_type as keyof typeof order] ?? 4)
          );
        });
      days.push({ date: d, dateStr: ds, meals: dayMeals });
    }
    return days;
  }, [weekStart, meals]);

  // Navigate weeks
  const prevWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, -7));
  }, []);

  const nextWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, 7));
  }, []);

  const goToThisWeek = useCallback(() => {
    setWeekStart(getMonday(new Date()));
  }, []);

  // Complete meal
  const completeMutation = useMutation({
    mutationFn: (planId: string) =>
      api.post(`/meal-plans/${planId}/complete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["mealPlans", startStr, endStr],
      });
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  // AI Generate
  const [generating, setGenerating] = useState(false);
  const handleAIGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      await api.post("/meal-plans/generate", {
        start_date: startStr,
        end_date: endStr,
        meals_per_day: ["breakfast", "lunch", "dinner"],
      });
      queryClient.invalidateQueries({
        queryKey: ["mealPlans", startStr, endStr],
      });
      Alert.alert("Success", "Meal plan generated! Review your week below.");
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to generate meal plan.");
    } finally {
      setGenerating(false);
    }
  }, [startStr, endStr, queryClient]);

  const weekLabel = useMemo(() => {
    const s = weekStart;
    const e = weekEnd;
    if (s.getMonth() === e.getMonth()) {
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} - ${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${MONTH_NAMES[s.getMonth()].slice(0, 3)} ${s.getDate()} - ${MONTH_NAMES[e.getMonth()].slice(0, 3)} ${e.getDate()}, ${e.getFullYear()}`;
  }, [weekStart, weekEnd]);

  return (
    <View style={styles.container}>
      {/* Week navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={prevWeek} style={styles.weekNavBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goToThisWeek} style={styles.weekLabelBtn}>
          <Text style={styles.weekLabel}>{weekLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={nextWeek} style={styles.weekNavBtn}>
          <Ionicons
            name="chevron-forward"
            size={24}
            color={colors.foreground}
          />
        </TouchableOpacity>
      </View>

      {/* AI Generate button */}
      <TouchableOpacity
        style={styles.aiGenerateBtn}
        onPress={handleAIGenerate}
        disabled={generating}
      >
        {generating ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <Ionicons name="sparkles" size={18} color={colors.primaryForeground} />
        )}
        <Text style={styles.aiGenerateBtnText}>
          {generating ? "Generating..." : "AI Generate Week"}
        </Text>
      </TouchableOpacity>

      {/* Days list */}
      {isLoading && !isRefetching ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
        >
          {daysData.map((day) => {
            const isToday =
              toDateString(day.date) === toDateString(new Date());
            return (
              <View key={day.dateStr} style={styles.daySection}>
                {/* Day header */}
                <View
                  style={[
                    styles.dayHeader,
                    isToday && styles.dayHeaderToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayHeaderText,
                      isToday && styles.dayHeaderTextToday,
                    ]}
                  >
                    {formatDayHeader(day.date)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setAddMealDate(day.dateStr);
                      setShowAddMeal(true);
                    }}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={24}
                      color={isToday ? colors.primary : colors.mutedForeground}
                    />
                  </TouchableOpacity>
                </View>

                {/* Meals for the day */}
                {day.meals.length === 0 ? (
                  <TouchableOpacity
                    style={styles.emptyDay}
                    onPress={() => {
                      setAddMealDate(day.dateStr);
                      setShowAddMeal(true);
                    }}
                  >
                    <Ionicons
                      name="add"
                      size={18}
                      color={colors.mutedForeground}
                    />
                    <Text style={styles.emptyDayText}>Plan a meal</Text>
                  </TouchableOpacity>
                ) : (
                  day.meals.map((meal) => (
                    <MealCard
                      key={meal.id}
                      meal={meal}
                      onComplete={() => completeMutation.mutate(meal.id)}
                    />
                  ))
                )}
              </View>
            );
          })}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* FAB for add meal */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setAddMealDate(toDateString(new Date()));
          setShowAddMeal(true);
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.primaryForeground} />
      </TouchableOpacity>

      {/* Add Meal Modal */}
      <AddMealModal
        visible={showAddMeal}
        initialDate={addMealDate}
        onClose={() => setShowAddMeal(false)}
        onSaved={() => {
          queryClient.invalidateQueries({
            queryKey: ["mealPlans", startStr, endStr],
          });
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },

  // Week navigation
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  weekNavBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  weekLabelBtn: {
    flex: 1,
    alignItems: "center",
  },
  weekLabel: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.foreground,
  },

  // AI Generate
  aiGenerateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
  },
  aiGenerateBtnText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.primaryForeground,
  },

  // Day sections
  daySection: {
    marginBottom: spacing.md,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayHeaderToday: {
    borderBottomColor: colors.primary,
    borderBottomWidth: 2,
  },
  dayHeaderText: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.foreground,
  },
  dayHeaderTextToday: {
    color: colors.primary,
  },

  // Empty day
  emptyDay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    marginTop: spacing.sm,
  },
  emptyDayText: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },

  // Meal card
  mealCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealCardCompleted: {
    opacity: 0.6,
    backgroundColor: colors.muted,
  },
  mealCardLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  mealTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  mealTypeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  mealName: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.cardForeground,
  },
  mealNameCompleted: {
    textDecorationLine: "line-through",
    color: colors.mutedForeground,
  },
  mealServings: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  mealNotes: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    fontStyle: "italic",
    marginTop: 2,
  },
  completeBtn: {
    padding: spacing.xs,
  },

  // FAB
  fab: {
    position: "absolute",
    bottom: spacing.lg,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.foreground,
  },
  modalBody: {
    marginBottom: spacing.md,
  },

  // Form fields
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.muted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.base,
    color: colors.foreground,
  },

  // Meal type chips
  mealTypeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginBottom: spacing.md,
  },
  mealTypeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  mealTypeChipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.mutedForeground,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: "row",
    backgroundColor: colors.muted,
    borderRadius: borderRadius.md,
    padding: 2,
    marginBottom: spacing.md,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: borderRadius.md - 2,
  },
  modeBtnActive: {
    backgroundColor: colors.background,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeBtnText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  modeBtnTextActive: {
    color: colors.foreground,
  },

  // Selected recipe
  selectedRecipe: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.blue.bg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.blue.border,
  },
  selectedRecipeName: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.blue.text,
  },
  selectedRecipeMeta: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginTop: 2,
  },

  // Search results
  searchResults: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    maxHeight: 200,
  },
  searchResultItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchResultName: {
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  searchResultMeta: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginTop: 2,
  },

  // Primary button
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontSize: fontSize.base,
    fontWeight: "700",
  },
});
