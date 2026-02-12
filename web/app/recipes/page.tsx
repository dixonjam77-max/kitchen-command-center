"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Heart, Clock, Star, ChefHat, Filter,
  Grid3X3, List, Trash2, BookOpen,
} from "lucide-react";
import { Navigation } from "@/components/shared/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";
import Link from "next/link";

const CUISINES = [
  "american", "italian", "mexican", "chinese", "japanese", "indian",
  "thai", "french", "mediterranean", "korean", "vietnamese", "middle_eastern",
];
const DIFFICULTIES = ["easy", "medium", "hard"];
const DIETARY_FLAGS = [
  "gluten_free", "dairy_free", "vegetarian", "vegan", "low_carb", "keto", "nut_free",
];

interface RecipeListItem {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  total_time_minutes: number | null;
  tags: string[];
  cuisine: string | null;
  difficulty: string | null;
  dietary_flags: string[];
  rating: number | null;
  photo_url: string | null;
  is_favorite: boolean;
  source_type: string | null;
  created_at: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "text-green-600 bg-green-50",
  medium: "text-yellow-600 bg-yellow-50",
  hard: "text-red-600 bg-red-50",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  url: "URL Import",
  youtube: "YouTube",
  image: "Photo Import",
  ai_generated: "AI Generated",
};

export default function RecipesPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [maxTime, setMaxTime] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["recipes", search, cuisine, difficulty, maxTime, sortBy, sortDir, favoritesOnly],
    queryFn: () =>
      api.get<{ items: RecipeListItem[]; total: number }>("/recipes", {
        search: search || undefined,
        cuisine: cuisine || undefined,
        difficulty: difficulty || undefined,
        max_time: maxTime || undefined,
        is_favorite: favoritesOnly ? "true" : undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        limit: 100,
      }),
    enabled: isAuthenticated,
  });

  const toggleFavMutation = useMutation({
    mutationFn: ({ id, is_favorite }: { id: string; is_favorite: boolean }) =>
      api.patch(`/recipes/${id}`, { is_favorite }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/recipes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  const recipes = data?.items || [];

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Recipes</h2>
            <p className="text-muted-foreground text-sm">
              {data?.total || 0} recipes in your cookbook
            </p>
          </div>
          <Link
            href="/recipes/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add Recipe
          </Link>
        </div>

        {/* Search + Filters */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Search recipes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-md text-sm ${showFilters ? "bg-primary text-primary-foreground" : ""}`}
          >
            <Filter className="h-4 w-4" /> Filters
          </button>
          <button
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-md text-sm ${favoritesOnly ? "bg-red-50 text-red-600 border-red-200" : ""}`}
          >
            <Heart className={`h-4 w-4 ${favoritesOnly ? "fill-current" : ""}`} /> Favorites
          </button>
          <div className="flex border rounded-md">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 ${viewMode === "grid" ? "bg-muted" : ""}`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 ${viewMode === "list" ? "bg-muted" : ""}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="flex gap-3 mb-4 p-4 bg-muted/50 rounded-lg">
            <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} className="px-3 py-2 border rounded-md text-sm bg-background">
              <option value="">All cuisines</option>
              {CUISINES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="px-3 py-2 border rounded-md text-sm bg-background">
              <option value="">Any difficulty</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={maxTime} onChange={(e) => setMaxTime(e.target.value)} className="px-3 py-2 border rounded-md text-sm bg-background">
              <option value="">Any time</option>
              <option value="15">Under 15 min</option>
              <option value="30">Under 30 min</option>
              <option value="60">Under 1 hour</option>
              <option value="120">Under 2 hours</option>
            </select>
            <select value={`${sortBy}:${sortDir}`} onChange={(e) => { const [s, d] = e.target.value.split(":"); setSortBy(s); setSortDir(d); }} className="px-3 py-2 border rounded-md text-sm bg-background">
              <option value="name:asc">Name A-Z</option>
              <option value="name:desc">Name Z-A</option>
              <option value="created_at:desc">Newest first</option>
              <option value="created_at:asc">Oldest first</option>
              <option value="rating:desc">Highest rated</option>
              <option value="total_time_minutes:asc">Quickest</option>
            </select>
          </div>
        )}

        {/* Recipe Grid / List */}
        {isLoading ? (
          <p className="text-muted-foreground">Loading recipes...</p>
        ) : recipes.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No recipes yet</p>
            <p className="text-sm mt-1">Add your first recipe manually or import one with AI</p>
            <Link href="/recipes/new" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90">
              <Plus className="h-4 w-4" /> Add Recipe
            </Link>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipes.map((recipe) => (
              <div key={recipe.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow group">
                <Link href={`/recipes/${recipe.id}`} className="block p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-1">{recipe.name}</h3>
                    <button
                      onClick={(e) => { e.preventDefault(); toggleFavMutation.mutate({ id: recipe.id, is_favorite: !recipe.is_favorite }); }}
                      className="p-1 -mr-1"
                    >
                      <Heart className={`h-4 w-4 ${recipe.is_favorite ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
                    </button>
                  </div>
                  {recipe.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{recipe.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {recipe.difficulty && (
                      <span className={`text-xs px-2 py-0.5 rounded ${DIFFICULTY_COLORS[recipe.difficulty] || ""}`}>
                        {recipe.difficulty}
                      </span>
                    )}
                    {recipe.cuisine && (
                      <span className="text-xs px-2 py-0.5 bg-muted rounded">{recipe.cuisine}</span>
                    )}
                    {recipe.source_type && (
                      <span className="text-xs px-2 py-0.5 bg-muted rounded">{SOURCE_LABELS[recipe.source_type] || recipe.source_type}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {recipe.total_time_minutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {recipe.total_time_minutes} min
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <ChefHat className="h-3 w-3" /> {recipe.servings} servings
                    </span>
                    {recipe.rating && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {recipe.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  {recipe.dietary_flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {recipe.dietary_flags.map((f) => (
                        <span key={f} className="text-[10px] px-1.5 py-0.5 border rounded-full text-muted-foreground">{f.replace("_", " ")}</span>
                      ))}
                    </div>
                  )}
                </Link>
                <div className="border-t px-4 py-2 flex justify-end">
                  <button
                    onClick={() => { if (confirm(`Delete "${recipe.name}"?`)) deleteMutation.mutate(recipe.id); }}
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Recipe</th>
                  <th className="text-left p-3 font-medium">Cuisine</th>
                  <th className="text-left p-3 font-medium">Difficulty</th>
                  <th className="text-left p-3 font-medium">Time</th>
                  <th className="text-left p-3 font-medium">Rating</th>
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="p-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => (
                  <tr key={recipe.id} className="border-t hover:bg-accent/50">
                    <td className="p-3">
                      <Link href={`/recipes/${recipe.id}`} className="font-medium hover:text-primary">{recipe.name}</Link>
                    </td>
                    <td className="p-3 text-muted-foreground">{recipe.cuisine || "—"}</td>
                    <td className="p-3">
                      {recipe.difficulty ? (
                        <span className={`text-xs px-2 py-0.5 rounded ${DIFFICULTY_COLORS[recipe.difficulty] || ""}`}>{recipe.difficulty}</span>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">{recipe.total_time_minutes ? `${recipe.total_time_minutes} min` : "—"}</td>
                    <td className="p-3">
                      {recipe.rating ? (
                        <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {recipe.rating.toFixed(1)}</span>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{SOURCE_LABELS[recipe.source_type || ""] || "—"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleFavMutation.mutate({ id: recipe.id, is_favorite: !recipe.is_favorite })}
                          className="p-1.5"
                        >
                          <Heart className={`h-4 w-4 ${recipe.is_favorite ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete "${recipe.name}"?`)) deleteMutation.mutate(recipe.id); }}
                          className="p-1.5 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
