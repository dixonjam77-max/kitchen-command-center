"use client";

import { Navigation } from "@/components/shared/navigation";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BarChart3, TrendingDown, TrendingUp, Minus, AlertTriangle,
  Leaf, DollarSign, Trash2, PieChart, Sparkles, RefreshCw,
  Calendar, ArrowRight,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────── */
interface WasteAnalysis {
  total_items_wasted?: number;
  total_estimated_cost?: number;
  most_wasted_items?: { name: string; count: number; total_cost: number }[];
  patterns?: string[];
  recommendations?: { title: string; description: string; priority: string }[];
  waste_by_reason?: Record<string, number>;
  waste_by_category?: Record<string, number>;
  trend?: string;
  monthly_summary?: { month: string; cost: number; count: number }[];
  message?: string;
}

interface DbSummary {
  total_items: number;
  total_cost: number;
  by_reason: Record<string, number>;
  by_category: Record<string, number>;
  most_wasted: { name: string; count: number; total_cost: number }[];
  monthly: { month: string; cost: number; count: number }[];
  trend: string;
}

interface SeasonalData {
  month?: string;
  in_season?: { name: string; peak: boolean; description: string }[];
  recipe_ideas?: { name: string; description: string; seasonal_ingredients: string[]; total_time_minutes: number }[];
  tips?: string[];
  items_user_has_in_season?: string[];
}

interface ForecastData {
  forecast_date?: string;
  items_will_run_out?: { name: string; current_qty: number; needed_qty: number; unit: string; runs_out_by: string }[];
  items_getting_low?: { name: string; current_qty: number; projected_qty: number; unit: string }[];
  items_expiring_unused?: { name: string; expires: string }[];
  shopping_needed?: { name: string; quantity_short: number; unit: string; needed_for: string }[];
}

export default function AnalyticsPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"waste" | "seasonal" | "forecast">("waste");
  const [wasteDays, setWasteDays] = useState(90);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/login");
  }, [isLoading, isAuthenticated, router]);

  /* ── Waste Analysis ───────────────────────────────────────── */
  const wasteQ = useQuery({
    queryKey: ["waste-analysis", wasteDays],
    queryFn: () =>
      api.post<{ analysis: WasteAnalysis; db_summary: DbSummary }>(
        `/ai/waste-analysis?days=${wasteDays}`
      ),
    enabled: isAuthenticated && activeTab === "waste",
  });

  /* ── Seasonal ─────────────────────────────────────────────── */
  const seasonalQ = useQuery({
    queryKey: ["seasonal"],
    queryFn: () => api.post<{ seasonal: SeasonalData }>("/ai/seasonal-suggestions"),
    enabled: isAuthenticated && activeTab === "seasonal",
  });

  /* ── Pantry Forecast ──────────────────────────────────────── */
  const forecastQ = useQuery({
    queryKey: ["forecast"],
    queryFn: () => api.post<{ forecast: ForecastData }>("/ai/pantry-forecast"),
    enabled: isAuthenticated && activeTab === "forecast",
  });

  if (isLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  const analysis = wasteQ.data?.analysis;
  const dbSummary = wasteQ.data?.db_summary;
  const seasonal = seasonalQ.data?.seasonal;
  const forecast = forecastQ.data?.forecast;

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8 overflow-auto max-h-screen">
        <div className="max-w-5xl">
          <h2 className="text-2xl font-bold mb-1">Analytics</h2>
          <p className="text-muted-foreground mb-6">
            Waste tracking, seasonal insights, and pantry forecasting.
          </p>

          {/* Tab navigation */}
          <div className="flex gap-1 mb-6 border-b">
            {[
              { key: "waste", label: "Waste Tracker", icon: Trash2 },
              { key: "seasonal", label: "Seasonal", icon: Leaf },
              { key: "forecast", label: "Pantry Forecast", icon: TrendingDown },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* ═══ Waste Tracker Tab ═══ */}
          {activeTab === "waste" && (
            <div>
              {/* Time range selector */}
              <div className="flex items-center gap-2 mb-6">
                <span className="text-sm text-muted-foreground">Period:</span>
                {[30, 60, 90, 180].map((d) => (
                  <button
                    key={d}
                    onClick={() => setWasteDays(d)}
                    className={`px-3 py-1 text-sm rounded-md ${
                      wasteDays === d
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent hover:bg-accent/80"
                    }`}
                  >
                    {d} days
                  </button>
                ))}
              </div>

              {wasteQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Analyzing waste data...</p>
              ) : analysis?.message ? (
                <div className="p-8 text-center border rounded-lg">
                  <Trash2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{analysis.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Log waste from the Pantry page to start tracking.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Summary cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="border rounded-lg p-4 text-center">
                      <Trash2 className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
                      <p className="text-2xl font-bold">{dbSummary?.total_items || 0}</p>
                      <p className="text-xs text-muted-foreground">Items Wasted</p>
                    </div>
                    <div className="border rounded-lg p-4 text-center">
                      <DollarSign className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
                      <p className="text-2xl font-bold">${(dbSummary?.total_cost || 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Estimated Cost</p>
                    </div>
                    <div className="border rounded-lg p-4 text-center">
                      {dbSummary?.trend === "improving" ? (
                        <TrendingDown className="h-5 w-5 text-green-500 mx-auto mb-1" />
                      ) : dbSummary?.trend === "worsening" ? (
                        <TrendingUp className="h-5 w-5 text-red-500 mx-auto mb-1" />
                      ) : (
                        <Minus className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
                      )}
                      <p className="text-2xl font-bold capitalize">{dbSummary?.trend || "N/A"}</p>
                      <p className="text-xs text-muted-foreground">Trend</p>
                    </div>
                    <div className="border rounded-lg p-4 text-center">
                      <PieChart className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
                      <p className="text-2xl font-bold">
                        {dbSummary?.most_wasted?.[0]?.name || "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground">Most Wasted</p>
                    </div>
                  </div>

                  {/* Waste by reason */}
                  {dbSummary?.by_reason && Object.keys(dbSummary.by_reason).length > 0 && (
                    <div className="border rounded-lg p-5">
                      <h3 className="text-sm font-semibold mb-3">Waste by Reason</h3>
                      <div className="space-y-2">
                        {Object.entries(dbSummary.by_reason)
                          .sort(([, a], [, b]) => b - a)
                          .map(([reason, count]) => {
                            const total = Object.values(dbSummary.by_reason).reduce((s, v) => s + v, 0);
                            const pct = total > 0 ? (count / total) * 100 : 0;
                            return (
                              <div key={reason} className="flex items-center gap-3">
                                <span className="text-sm w-24 capitalize">{reason.replace("_", " ")}</span>
                                <div className="flex-1 bg-accent/30 rounded-full h-4 overflow-hidden">
                                  <div
                                    className="h-full bg-rose-400 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground w-12 text-right">
                                  {count} ({Math.round(pct)}%)
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Monthly chart (bar-style) */}
                  {dbSummary?.monthly && dbSummary.monthly.length > 0 && (
                    <div className="border rounded-lg p-5">
                      <h3 className="text-sm font-semibold mb-3">Monthly Waste Cost</h3>
                      <div className="flex items-end gap-2 h-32">
                        {dbSummary.monthly.map((m) => {
                          const maxCost = Math.max(...dbSummary.monthly.map((x) => x.cost), 1);
                          const h = (m.cost / maxCost) * 100;
                          return (
                            <div key={m.month} className="flex-1 flex flex-col items-center">
                              <span className="text-xs text-muted-foreground mb-1">
                                ${m.cost.toFixed(0)}
                              </span>
                              <div
                                className="w-full bg-rose-400 rounded-t transition-all"
                                style={{ height: `${h}%`, minHeight: "4px" }}
                              />
                              <span className="text-xs text-muted-foreground mt-1">
                                {m.month.slice(5)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Most wasted items */}
                  {dbSummary?.most_wasted && dbSummary.most_wasted.length > 0 && (
                    <div className="border rounded-lg p-5">
                      <h3 className="text-sm font-semibold mb-3">Most Wasted Items</h3>
                      <div className="space-y-2">
                        {dbSummary.most_wasted.slice(0, 8).map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span>{item.name}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-muted-foreground">{item.count}x</span>
                              <span className="text-rose-600 font-medium">
                                ${item.total_cost.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Recommendations */}
                  {analysis?.recommendations && analysis.recommendations.length > 0 && (
                    <div className="border rounded-lg p-5">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-500" />
                        AI Recommendations
                      </h3>
                      <div className="space-y-3">
                        {analysis.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-accent/30 rounded-lg">
                            <div className="mt-0.5">
                              {rec.priority === "high" && <AlertTriangle className="h-4 w-4 text-red-500" />}
                              {rec.priority === "medium" && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                              {rec.priority === "low" && <Sparkles className="h-4 w-4 text-blue-500" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{rec.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Patterns */}
                  {analysis?.patterns && analysis.patterns.length > 0 && (
                    <div className="border rounded-lg p-5">
                      <h3 className="text-sm font-semibold mb-3">Detected Patterns</h3>
                      <ul className="space-y-1.5">
                        {analysis.patterns.map((p, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ Seasonal Tab ═══ */}
          {activeTab === "seasonal" && (
            <div>
              {seasonalQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading seasonal data...</p>
              ) : seasonal ? (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Leaf className="h-5 w-5 text-green-500" />
                    In Season: {seasonal.month || "This Month"}
                  </h3>

                  {/* In season items */}
                  {seasonal.in_season && seasonal.in_season.length > 0 && (
                    <div className="border rounded-lg p-5">
                      <h4 className="text-sm font-semibold mb-3">What&apos;s In Season</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {seasonal.in_season.map((item, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg border text-sm ${
                              item.peak
                                ? "border-green-300 bg-green-50 dark:bg-green-950/20"
                                : "border-gray-200"
                            }`}
                          >
                            <span className="font-medium">{item.name}</span>
                            {item.peak && (
                              <span className="ml-1.5 text-xs px-1.5 py-0.5 bg-green-200 text-green-800 rounded">
                                Peak
                              </span>
                            )}
                            {item.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {item.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Items user has in season */}
                  {seasonal.items_user_has_in_season && seasonal.items_user_has_in_season.length > 0 && (
                    <div className="border rounded-lg p-5 border-green-200 bg-green-50/50 dark:bg-green-950/10">
                      <h4 className="text-sm font-semibold mb-2 text-green-800 dark:text-green-400">
                        You Already Have These In-Season Items
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {seasonal.items_user_has_in_season.map((item, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 text-xs rounded-full bg-green-200 text-green-800"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Seasonal recipe ideas */}
                  {seasonal.recipe_ideas && seasonal.recipe_ideas.length > 0 && (
                    <div className="border rounded-lg p-5">
                      <h4 className="text-sm font-semibold mb-3">Seasonal Recipe Ideas</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {seasonal.recipe_ideas.map((recipe, i) => (
                          <div key={i} className="p-3 border rounded-lg">
                            <p className="text-sm font-medium">{recipe.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">{recipe.description}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-xs text-muted-foreground">
                                {recipe.total_time_minutes} min
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {recipe.seasonal_ingredients.slice(0, 3).map((ing, j) => (
                                  <span
                                    key={j}
                                    className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded"
                                  >
                                    {ing}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Seasonal tips */}
                  {seasonal.tips && seasonal.tips.length > 0 && (
                    <div className="border rounded-lg p-5">
                      <h4 className="text-sm font-semibold mb-3">Seasonal Tips</h4>
                      <ul className="space-y-2">
                        {seasonal.tips.map((tip, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <Leaf className="h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No seasonal data available.</p>
              )}
            </div>
          )}

          {/* ═══ Pantry Forecast Tab ═══ */}
          {activeTab === "forecast" && (
            <div>
              {forecastQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Calculating pantry forecast...</p>
              ) : forecast ? (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-blue-500" />
                    Pantry Forecast
                    {forecast.forecast_date && (
                      <span className="text-sm font-normal text-muted-foreground">
                        through {forecast.forecast_date}
                      </span>
                    )}
                  </h3>

                  {/* Items that will run out */}
                  {forecast.items_will_run_out && forecast.items_will_run_out.length > 0 && (
                    <div className="border-2 border-red-300 rounded-lg p-5 bg-red-50 dark:bg-red-950/20">
                      <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3">
                        Will Run Out ({forecast.items_will_run_out.length})
                      </h4>
                      <div className="space-y-2">
                        {forecast.items_will_run_out.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.name}</span>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>
                                Have: {item.current_qty} {item.unit}
                              </span>
                              <span>
                                Need: {item.needed_qty} {item.unit}
                              </span>
                              <span className="text-red-600">by {item.runs_out_by}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Items getting low */}
                  {forecast.items_getting_low && forecast.items_getting_low.length > 0 && (
                    <div className="border-2 border-yellow-300 rounded-lg p-5 bg-yellow-50 dark:bg-yellow-950/20">
                      <h4 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-3">
                        Getting Low ({forecast.items_getting_low.length})
                      </h4>
                      <div className="space-y-2">
                        {forecast.items_getting_low.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span>{item.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {item.current_qty} {item.unit} &rarr; {item.projected_qty} {item.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Items expiring unused */}
                  {forecast.items_expiring_unused && forecast.items_expiring_unused.length > 0 && (
                    <div className="border-2 border-orange-300 rounded-lg p-5 bg-orange-50 dark:bg-orange-950/20">
                      <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-3">
                        Expiring Without a Plan ({forecast.items_expiring_unused.length})
                      </h4>
                      <div className="space-y-2">
                        {forecast.items_expiring_unused.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span>{item.name}</span>
                            <span className="text-xs text-orange-600">expires {item.expires}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shopping needed */}
                  {forecast.shopping_needed && forecast.shopping_needed.length > 0 && (
                    <div className="border rounded-lg p-5">
                      <h4 className="text-sm font-semibold mb-3">Shopping Needed</h4>
                      <div className="space-y-2">
                        {forecast.shopping_needed.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span>{item.name}</span>
                            <div className="text-xs text-muted-foreground">
                              {item.quantity_short} {item.unit} for {item.needed_for}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All clear message */}
                  {(!forecast.items_will_run_out || forecast.items_will_run_out.length === 0) &&
                    (!forecast.items_getting_low || forecast.items_getting_low.length === 0) && (
                    <div className="p-6 text-center border rounded-lg bg-green-50 dark:bg-green-950/20">
                      <p className="text-green-700 dark:text-green-400 font-medium">
                        Your pantry is well-stocked for your planned meals!
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center border rounded-lg">
                  <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    Plan some meals to see your pantry forecast.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
