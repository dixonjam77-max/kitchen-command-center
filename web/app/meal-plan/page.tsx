"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Trash2,
  Check, Calendar as CalendarIcon, Clock, Loader2, X,
} from "lucide-react";
import { Navigation } from "@/components/shared/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";
import Link from "next/link";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const MEAL_COLORS: Record<string, string> = {
  breakfast: "border-l-yellow-400",
  lunch: "border-l-blue-400",
  dinner: "border-l-purple-400",
  snack: "border-l-green-400",
};

interface MealPlan {
  id: string;
  plan_date: string;
  meal_type: string;
  recipe_id: string | null;
  custom_meal: string | null;
  servings: number | null;
  notes: string | null;
  completed: boolean;
  leftover_portions: number | null;
}

interface RecipeOption {
  id: string;
  name: string;
  total_time_minutes: number | null;
  cuisine: string | null;
}

function getWeekDates(baseDate: Date): Date[] {
  const dates: Date[] = [];
  const day = baseDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + mondayOffset);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function MealPlanPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState<"week" | "month">("week");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [addMealType, setAddMealType] = useState("dinner");
  const [addRecipeId, setAddRecipeId] = useState("");
  const [addCustomMeal, setAddCustomMeal] = useState("");
  const [addServings, setAddServings] = useState("4");
  const [showGenerate, setShowGenerate] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [showComplete, setShowComplete] = useState<string | null>(null);
  const [completeLeftovers, setCompleteLeftovers] = useState("");
  const [completeNotes, setCompleteNotes] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const baseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
  const startDate = formatDate(weekDates[0]);
  const endDate = formatDate(weekDates[6]);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["meal-plans", startDate, endDate],
    queryFn: () => api.get<MealPlan[]>("/meal-plans", { start_date: startDate, end_date: endDate }),
    enabled: isAuthenticated,
  });

  const { data: recipes } = useQuery({
    queryKey: ["recipes-for-plan", recipeSearch],
    queryFn: () => api.get<{ items: RecipeOption[] }>("/recipes", { search: recipeSearch, limit: 50 }),
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/meal-plans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      setShowAddModal(false);
      setAddRecipeId("");
      setAddCustomMeal("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/meal-plans/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meal-plans"] }),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.post(`/meal-plans/${id}/complete`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["pantry-items"] });
      setShowComplete(null);
    },
  });

  async function handleGenerate(body: Record<string, unknown>) {
    setGenLoading(true);
    setGenError("");
    try {
      await api.post("/meal-plans/generate", body);
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      setShowGenerate(false);
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenLoading(false);
    }
  }

  function openAddModal(dateStr: string, mealType: string) {
    setAddDate(dateStr);
    setAddMealType(mealType);
    setAddRecipeId("");
    setAddCustomMeal("");
    setAddServings("4");
    setShowAddModal(true);
  }

  function getPlansByDateAndType(dateStr: string, mealType: string) {
    return (plans || []).filter(
      (p) => p.plan_date === dateStr && p.meal_type === mealType,
    );
  }

  function getRecipeName(recipeId: string | null) {
    if (!recipeId) return null;
    return recipes?.items?.find((r) => r.id === recipeId)?.name || "Recipe";
  }

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Meal Plan</h2>
            <p className="text-muted-foreground text-sm">
              {weekDates[0].toLocaleDateString("en-US", { month: "long", day: "numeric" })} — {weekDates[6].toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
            >
              <Sparkles className="h-4 w-4" /> AI Plan Week
            </button>
            <Link href="/grocery" className="flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent">
              Generate Grocery List
            </Link>
          </div>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setWeekOffset(weekOffset - 1)} className="p-2 hover:bg-accent rounded">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setWeekOffset(0)} className="px-3 py-1 text-sm border rounded hover:bg-accent">
            Today
          </button>
          <button onClick={() => setWeekOffset(weekOffset + 1)} className="p-2 hover:bg-accent rounded">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Week Grid */}
        {isLoading ? (
          <p className="text-muted-foreground">Loading meal plans...</p>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {/* Day Headers */}
            {weekDates.map((d) => {
              const isToday = formatDate(d) === formatDate(new Date());
              return (
                <div key={formatDate(d)} className={`text-center p-2 text-sm font-medium rounded-t-lg ${isToday ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {formatDateShort(d)}
                </div>
              );
            })}

            {/* Meal Type Rows */}
            {MEAL_TYPES.map((mealType) => (
              weekDates.map((d) => {
                const dateStr = formatDate(d);
                const dayPlans = getPlansByDateAndType(dateStr, mealType);

                return (
                  <div key={`${dateStr}-${mealType}`} className="min-h-[80px] border rounded-lg p-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase text-muted-foreground font-medium">{mealType}</span>
                      <button
                        onClick={() => openAddModal(dateStr, mealType)}
                        className="p-0.5 text-muted-foreground hover:text-primary"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    {dayPlans.map((plan) => (
                      <div
                        key={plan.id}
                        className={`text-xs p-1.5 rounded border-l-2 mb-1 ${MEAL_COLORS[plan.meal_type] || ""} ${plan.completed ? "opacity-60 bg-muted" : "bg-card"}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className={`font-medium ${plan.completed ? "line-through" : ""}`}>
                            {plan.custom_meal || getRecipeName(plan.recipe_id) || "Meal"}
                          </span>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {!plan.completed && (
                              <button
                                onClick={() => { setShowComplete(plan.id); setCompleteLeftovers(""); setCompleteNotes(""); }}
                                className="p-0.5 text-muted-foreground hover:text-green-600"
                                title="Mark complete"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              onClick={() => { if (confirm("Remove this meal?")) deleteMutation.mutate(plan.id); }}
                              className="p-0.5 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        {plan.servings && <span className="text-muted-foreground">{plan.servings} servings</span>}
                        {plan.leftover_portions && plan.leftover_portions > 0 && (
                          <span className="text-green-600 ml-1">+{plan.leftover_portions} leftover</span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })
            ))}
          </div>
        )}

        {/* Add Meal Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
            <div className="bg-card border rounded-lg w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Add Meal — {addDate}</h2>
                <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await createMutation.mutateAsync({
                    plan_date: addDate,
                    meal_type: addMealType,
                    recipe_id: addRecipeId || null,
                    custom_meal: addCustomMeal || null,
                    servings: parseInt(addServings) || 4,
                  });
                }}
                className="p-4 space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium mb-1">Meal Type</label>
                  <select value={addMealType} onChange={(e) => setAddMealType(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                    {MEAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Recipe</label>
                  <input
                    placeholder="Search recipes..."
                    value={recipeSearch}
                    onChange={(e) => setRecipeSearch(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm mb-2"
                  />
                  <select value={addRecipeId} onChange={(e) => { setAddRecipeId(e.target.value); setAddCustomMeal(""); }} className="w-full px-3 py-2 border rounded-md text-sm">
                    <option value="">Select a recipe...</option>
                    {recipes?.items?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.total_time_minutes ? ` (${r.total_time_minutes} min)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Or Custom Meal</label>
                  <input
                    value={addCustomMeal}
                    onChange={(e) => { setAddCustomMeal(e.target.value); setAddRecipeId(""); }}
                    placeholder="e.g., Leftovers, Eating out"
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Servings</label>
                  <input type="number" value={addServings} onChange={(e) => setAddServings(e.target.value)} min={1} className="w-full px-3 py-2 border rounded-md text-sm" />
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={createMutation.isPending || (!addRecipeId && !addCustomMeal)} className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {createMutation.isPending ? "Adding..." : "Add Meal"}
                  </button>
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 border rounded-md text-sm hover:bg-accent">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Complete Meal Modal */}
        {showComplete && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
            <div className="bg-card border rounded-lg w-full max-w-sm">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Complete Meal</h2>
                <button onClick={() => setShowComplete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm text-muted-foreground">Completing this meal will deduct ingredients from your pantry.</p>
                <div>
                  <label className="block text-sm font-medium mb-1">Leftover Portions</label>
                  <input type="number" value={completeLeftovers} onChange={(e) => setCompleteLeftovers(e.target.value)} min={0} placeholder="0" className="w-full px-3 py-2 border rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea value={completeNotes} onChange={(e) => setCompleteNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => completeMutation.mutate({
                      id: showComplete!,
                      data: {
                        leftover_portions: completeLeftovers ? parseInt(completeLeftovers) : null,
                        notes: completeNotes || null,
                      },
                    })}
                    disabled={completeMutation.isPending}
                    className="flex-1 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {completeMutation.isPending ? "Completing..." : "Complete & Deduct"}
                  </button>
                  <button onClick={() => setShowComplete(null)} className="px-4 py-2 border rounded-md text-sm hover:bg-accent">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Generate Modal */}
        {showGenerate && (
          <AIGenerateModal
            startDate={startDate}
            endDate={endDate}
            loading={genLoading}
            error={genError}
            onGenerate={handleGenerate}
            onClose={() => setShowGenerate(false)}
          />
        )}
      </main>
    </div>
  );
}

function AIGenerateModal({
  startDate, endDate, loading, error, onGenerate, onClose,
}: {
  startDate: string; endDate: string; loading: boolean; error: string;
  onGenerate: (body: Record<string, unknown>) => void; onClose: () => void;
}) {
  const [maxTime, setMaxTime] = useState("");
  const [cuisines, setCuisines] = useState("");
  const [meals, setMeals] = useState(["breakfast", "lunch", "dinner"]);

  function toggleMeal(m: string) {
    setMeals((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
      <div className="bg-card border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">AI Meal Plan Generator</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mx-4 mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded">{error}</div>}
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate a meal plan for {startDate} to {endDate} based on your pantry, recipes, and preferences.
          </p>
          <div>
            <label className="block text-sm font-medium mb-2">Meals to Plan</label>
            <div className="flex gap-2">
              {MEAL_TYPES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMeal(m)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    meals.includes(m) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground hover:bg-accent"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Weeknight Cook Time (min)</label>
            <input type="number" value={maxTime} onChange={(e) => setMaxTime(e.target.value)} placeholder="e.g., 45" className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Preferred Cuisines (comma-separated)</label>
            <input value={cuisines} onChange={(e) => setCuisines(e.target.value)} placeholder="e.g., italian, mexican, thai" className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onGenerate({
                start_date: startDate,
                end_date: endDate,
                meals_per_day: meals,
                max_weeknight_time: maxTime ? parseInt(maxTime) : undefined,
                preferred_cuisines: cuisines ? cuisines.split(",").map((c) => c.trim()) : [],
              })}
              disabled={loading}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <span className="flex items-center gap-2 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Generating...</span> : "Generate Plan"}
            </button>
            <button onClick={onClose} className="px-4 py-2 border rounded-md text-sm hover:bg-accent">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
