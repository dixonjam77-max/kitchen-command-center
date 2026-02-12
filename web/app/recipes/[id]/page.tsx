"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Heart, Clock, ChefHat, Star, Pencil, Copy,
  History, CookingPot, Trash2, Scale, Plus, Play, Share2,
} from "lucide-react";
import { Navigation } from "@/components/shared/navigation";
import { CookLogForm } from "@/components/recipes/cook-log-form";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";
import Link from "next/link";

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "text-green-600 bg-green-50",
  medium: "text-yellow-600 bg-yellow-50",
  hard: "text-red-600 bg-red-50",
};

interface RecipeIngredient {
  id: string;
  ingredient_name: string;
  canonical_name: string | null;
  quantity: number | null;
  unit: string | null;
  preparation: string | null;
  group_name: string | null;
  optional: boolean;
  pantry_item_id: string | null;
}

interface RecipeTool {
  id: string;
  tool_name: string;
  tool_id: string | null;
  optional: boolean;
  notes: string | null;
}

interface Recipe {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  instructions: { step: number; text: string; duration_minutes?: number | null }[] | null;
  source_type: string | null;
  source_url: string | null;
  source_attribution: string | null;
  tags: string[];
  cuisine: string | null;
  difficulty: string | null;
  dietary_flags: string[];
  rating: number | null;
  photo_url: string | null;
  is_favorite: boolean;
  version: number;
  parent_recipe_id: string | null;
  notes: string | null;
  ingredients: RecipeIngredient[];
  tools: RecipeTool[];
  created_at: string;
  updated_at: string;
}

interface CookLog {
  id: string;
  cooked_date: string;
  servings_made: number | null;
  rating: number | null;
  modifications: string | null;
  notes: string | null;
  duration_minutes: number | null;
  created_at: string;
}

interface ScaleResult {
  original_servings: number;
  target_servings: number;
  ratio: number;
  scaled_ingredients: { ingredient_name: string; quantity: number | null; unit: string | null }[];
}

export default function RecipeDetailPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const recipeId = params.id as string;

  const [showCookLog, setShowCookLog] = useState(false);
  const [scaleServings, setScaleServings] = useState("");
  const [scaleResult, setScaleResult] = useState<ScaleResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const { data: recipe, isLoading } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => api.get<Recipe>(`/recipes/${recipeId}`),
    enabled: isAuthenticated && !!recipeId,
  });

  const { data: cookLogs } = useQuery({
    queryKey: ["cook-logs", recipeId],
    queryFn: () => api.get<CookLog[]>(`/recipes/${recipeId}/cook-logs`),
    enabled: isAuthenticated && !!recipeId,
  });

  const { data: versionHistory } = useQuery({
    queryKey: ["recipe-history", recipeId],
    queryFn: () => api.get<{ id: string; name: string; version: number; created_at: string }[]>(`/recipes/${recipeId}/history`),
    enabled: isAuthenticated && !!recipeId && showHistory,
  });

  const toggleFavMutation = useMutation({
    mutationFn: (fav: boolean) => api.patch(`/recipes/${recipeId}`, { is_favorite: fav }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] }),
  });

  const createVersionMutation = useMutation({
    mutationFn: () => api.post<Recipe>(`/recipes/${recipeId}/version`),
    onSuccess: (newRecipe) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      router.push(`/recipes/${(newRecipe as Recipe).id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.del(`/recipes/${recipeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      router.push("/recipes");
    },
  });

  async function handleScale() {
    if (!scaleServings) return;
    const result = await api.post<ScaleResult>(`/recipes/${recipeId}/scale`, {
      servings: parseInt(scaleServings),
    });
    setScaleResult(result);
  }

  async function handleLogCook(data: Record<string, unknown>) {
    await api.post(`/recipes/${recipeId}/cook`, data);
    queryClient.invalidateQueries({ queryKey: ["cook-logs", recipeId] });
    setShowCookLog(false);
  }

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  if (isLoading || !recipe) {
    return (
      <div className="flex">
        <Navigation />
        <main className="flex-1 p-8">
          <p className="text-muted-foreground">Loading recipe...</p>
        </main>
      </div>
    );
  }

  const groupedIngredients = new Map<string, RecipeIngredient[]>();
  for (const ing of recipe.ingredients) {
    const group = ing.group_name || "";
    if (!groupedIngredients.has(group)) groupedIngredients.set(group, []);
    groupedIngredients.get(group)!.push(ing);
  }

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <Link href="/recipes" className="p-2 hover:bg-accent rounded-md mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{recipe.name}</h2>
              <button onClick={() => toggleFavMutation.mutate(!recipe.is_favorite)}>
                <Heart className={`h-5 w-5 ${recipe.is_favorite ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
              </button>
            </div>
            {recipe.description && <p className="text-muted-foreground mt-1">{recipe.description}</p>}

            {/* Meta badges */}
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {recipe.total_time_minutes && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" /> {recipe.total_time_minutes} min
                  {recipe.prep_time_minutes && recipe.cook_time_minutes && (
                    <span className="text-xs ml-1">({recipe.prep_time_minutes} prep + {recipe.cook_time_minutes} cook)</span>
                  )}
                </span>
              )}
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <ChefHat className="h-4 w-4" /> {recipe.servings} servings
              </span>
              {recipe.difficulty && (
                <span className={`text-xs px-2 py-0.5 rounded ${DIFFICULTY_COLORS[recipe.difficulty] || ""}`}>{recipe.difficulty}</span>
              )}
              {recipe.cuisine && <span className="text-xs px-2 py-0.5 bg-muted rounded">{recipe.cuisine}</span>}
              {recipe.rating && (
                <span className="flex items-center gap-1 text-sm">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" /> {recipe.rating.toFixed(1)}
                </span>
              )}
              {recipe.version > 1 && (
                <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">v{recipe.version}</span>
              )}
            </div>

            {/* Tags + Dietary */}
            {(recipe.tags.length > 0 || recipe.dietary_flags.length > 0) && (
              <div className="flex flex-wrap gap-1 mt-2">
                {recipe.tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 bg-muted rounded">{t}</span>
                ))}
                {recipe.dietary_flags.map((f) => (
                  <span key={f} className="text-xs px-2 py-0.5 border rounded-full text-muted-foreground">{f.replace("_", " ")}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mb-8">
          {recipe.instructions && recipe.instructions.length > 0 && (
            <Link
              href={`/recipes/${recipeId}/cook`}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
            >
              <Play className="h-4 w-4" /> Start Cooking
            </Link>
          )}
          <button onClick={() => setShowCookLog(true)} className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-accent">
            <CookingPot className="h-4 w-4" /> Log Cook
          </button>
          <button
            onClick={async () => {
              try {
                const data = await api.get<{ recipe: Record<string, unknown>; share_card: Record<string, unknown> }>(`/import/recipes/${recipeId}/share`);
                const text = `${(data.share_card as Record<string, unknown>).emoji || "🍳"} ${recipe.name}\n${(data.share_card as Record<string, unknown>).tagline || recipe.description || ""}\n\nServings: ${recipe.servings} | Time: ${recipe.total_time_minutes || "?"} min`;
                await navigator.clipboard.writeText(text);
                alert("Recipe share text copied to clipboard!");
              } catch {
                const text = `🍳 ${recipe.name}\n${recipe.description || ""}\nServings: ${recipe.servings}`;
                await navigator.clipboard.writeText(text);
                alert("Recipe summary copied to clipboard!");
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-accent"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button onClick={() => createVersionMutation.mutate()} className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-accent">
            <Copy className="h-4 w-4" /> Fork Version
          </button>
          <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-accent">
            <History className="h-4 w-4" /> History
          </button>
          <button
            onClick={() => { if (confirm(`Delete "${recipe.name}"?`)) deleteMutation.mutate(); }}
            className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-accent text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>

        {/* Version History */}
        {showHistory && versionHistory && (
          <div className="mb-8 p-4 bg-muted/50 rounded-lg">
            <h3 className="font-semibold mb-3">Version History</h3>
            <div className="space-y-2">
              {versionHistory.map((v) => (
                <Link
                  key={v.id}
                  href={`/recipes/${v.id}`}
                  className={`flex items-center justify-between p-2 rounded text-sm hover:bg-accent ${v.id === recipeId ? "bg-primary/10 font-medium" : ""}`}
                >
                  <span>v{v.version} — {v.name}</span>
                  <span className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleDateString()}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Ingredients + Tools */}
          <div className="lg:col-span-1 space-y-6">
            {/* Scale */}
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-muted-foreground" />
              <input
                type="number"
                value={scaleServings}
                onChange={(e) => { setScaleServings(e.target.value); setScaleResult(null); }}
                placeholder={`${recipe.servings}`}
                className="w-16 px-2 py-1 border rounded text-sm"
                min={1}
              />
              <span className="text-sm text-muted-foreground">servings</span>
              <button onClick={handleScale} disabled={!scaleServings} className="text-sm text-primary hover:underline disabled:opacity-50">
                Scale
              </button>
            </div>

            {/* Ingredients */}
            <div>
              <h3 className="font-semibold mb-3">Ingredients</h3>
              {scaleResult ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">
                    Scaled from {scaleResult.original_servings} to {scaleResult.target_servings} servings ({scaleResult.ratio}x)
                  </p>
                  {scaleResult.scaled_ingredients.map((ing, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-sm py-1">
                      <span className="font-medium min-w-[4rem] text-right">
                        {ing.quantity != null ? `${ing.quantity} ${ing.unit || ""}`.trim() : ""}
                      </span>
                      <span>{ing.ingredient_name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                [...groupedIngredients.entries()].map(([group, ings]) => (
                  <div key={group} className="mb-3">
                    {group && <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{group}</p>}
                    {ings.map((ing) => (
                      <div key={ing.id} className="flex items-baseline gap-2 text-sm py-1">
                        <span className="font-medium min-w-[4rem] text-right">
                          {ing.quantity != null ? `${ing.quantity} ${ing.unit || ""}`.trim() : ""}
                        </span>
                        <span className={ing.optional ? "text-muted-foreground" : ""}>
                          {ing.ingredient_name}
                          {ing.preparation && <span className="text-muted-foreground">, {ing.preparation}</span>}
                          {ing.optional && <span className="text-xs ml-1">(optional)</span>}
                        </span>
                        {ing.pantry_item_id && (
                          <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded">in pantry</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Tools */}
            {recipe.tools.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Equipment</h3>
                <ul className="space-y-1">
                  {recipe.tools.map((tool) => (
                    <li key={tool.id} className="text-sm flex items-center gap-2">
                      <span className={tool.optional ? "text-muted-foreground" : ""}>
                        {tool.tool_name}
                        {tool.optional && <span className="text-xs ml-1">(optional)</span>}
                      </span>
                      {tool.tool_id && (
                        <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded">owned</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right: Instructions */}
          <div className="lg:col-span-2">
            <h3 className="font-semibold mb-3">Instructions</h3>
            {recipe.instructions && recipe.instructions.length > 0 ? (
              <ol className="space-y-4">
                {recipe.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                      {step.step || i + 1}
                    </span>
                    <div className="flex-1 pt-0.5">
                      <p className="text-sm">{step.text}</p>
                      {step.duration_minutes && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {step.duration_minutes} min
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No instructions added yet.</p>
            )}

            {/* Source */}
            {(recipe.source_url || recipe.source_attribution) && (
              <div className="mt-6 p-3 bg-muted/50 rounded text-sm">
                <p className="text-muted-foreground">
                  Source: {recipe.source_attribution || ""}
                  {recipe.source_url && (
                    <> — <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{recipe.source_url}</a></>
                  )}
                </p>
              </div>
            )}

            {recipe.notes && (
              <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 rounded text-sm">
                <p className="font-medium mb-1">Notes</p>
                <p>{recipe.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Cook Logs */}
        <div className="mt-8 border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Cook Log ({cookLogs?.length || 0})</h3>
            <button onClick={() => setShowCookLog(true)} className="flex items-center gap-1 text-sm text-primary hover:underline">
              <Plus className="h-3 w-3" /> Log a Cook
            </button>
          </div>
          {cookLogs && cookLogs.length > 0 ? (
            <div className="space-y-3">
              {cookLogs.map((log) => (
                <div key={log.id} className="p-3 border rounded-lg text-sm">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-medium">{new Date(log.cooked_date).toLocaleDateString()}</span>
                    {log.rating && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {log.rating}
                      </span>
                    )}
                    {log.servings_made && <span className="text-muted-foreground">{log.servings_made} servings</span>}
                    {log.duration_minutes && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {log.duration_minutes} min
                      </span>
                    )}
                  </div>
                  {log.modifications && <p className="text-muted-foreground">Mods: {log.modifications}</p>}
                  {log.notes && <p className="text-muted-foreground">{log.notes}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No cooks logged yet.</p>
          )}
        </div>

        {/* Cook Log Modal */}
        {showCookLog && (
          <CookLogForm
            defaultServings={recipe.servings}
            onSubmit={handleLogCook}
            onCancel={() => setShowCookLog(false)}
          />
        )}
      </main>
    </div>
  );
}
