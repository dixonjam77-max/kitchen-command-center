"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, FolderOpen, ChevronRight, X, ArrowLeft } from "lucide-react";
import { Navigation } from "@/components/shared/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";
import Link from "next/link";

interface Collection {
  id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  recipe_count: number;
  created_at: string;
}

interface RecipeListItem {
  id: string;
  name: string;
  cuisine: string | null;
  difficulty: string | null;
  total_time_minutes: number | null;
  rating: number | null;
}

export default function CollectionsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formError, setFormError] = useState("");

  // Add recipe to collection
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [addRecipeSearch, setAddRecipeSearch] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const { data: collections, isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: () => api.get<Collection[]>("/collections"),
    enabled: isAuthenticated,
  });

  const { data: collectionRecipes } = useQuery({
    queryKey: ["collection-recipes", selectedId],
    queryFn: () => api.get<RecipeListItem[]>(`/collections/${selectedId}/recipes`),
    enabled: isAuthenticated && !!selectedId,
  });

  const { data: searchResults } = useQuery({
    queryKey: ["recipe-search", addRecipeSearch],
    queryFn: () => api.get<{ items: RecipeListItem[] }>("/recipes", { search: addRecipeSearch, limit: 20 }),
    enabled: isAuthenticated && showAddRecipe && addRecipeSearch.length > 1,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => api.post("/collections", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["collections"] }); setShowCreate(false); setFormName(""); setFormDesc(""); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string } }) => api.patch(`/collections/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["collections"] }); setEditId(null); setFormName(""); setFormDesc(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/collections/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["collections"] }); if (selectedId === editId) setSelectedId(null); },
  });

  const addRecipeMutation = useMutation({
    mutationFn: ({ collId, recipeId }: { collId: string; recipeId: string }) =>
      api.post(`/collections/${collId}/recipes`, { recipe_id: recipeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection-recipes", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const removeRecipeMutation = useMutation({
    mutationFn: ({ collId, recipeId }: { collId: string; recipeId: string }) =>
      api.del(`/collections/${collId}/recipes/${recipeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection-recipes", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  function startEdit(coll: Collection) {
    setEditId(coll.id);
    setFormName(coll.name);
    setFormDesc(coll.description || "");
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) { setFormError("Name is required"); return; }
    setFormError("");
    await createMutation.mutateAsync({ name: formName.trim(), description: formDesc || undefined });
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !editId) return;
    await updateMutation.mutateAsync({ id: editId, data: { name: formName.trim(), description: formDesc || undefined } });
  }

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/recipes" className="p-2 hover:bg-accent rounded-md">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">Collections</h2>
            <p className="text-muted-foreground text-sm">Organize your recipes into collections</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setFormName(""); setFormDesc(""); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New Collection
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Collections List */}
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : !collections || collections.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No collections yet</p>
              </div>
            ) : (
              collections.map((coll) => (
                <div
                  key={coll.id}
                  onClick={() => setSelectedId(coll.id)}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedId === coll.id ? "border-primary bg-primary/5" : "hover:bg-accent"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{coll.name}</h3>
                      {coll.description && <p className="text-xs text-muted-foreground mt-0.5">{coll.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{coll.recipe_count} recipes</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(coll); }} className="p-1 text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${coll.name}"?`)) deleteMutation.mutate(coll.id); }}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Collection Recipes */}
          <div className="lg:col-span-2">
            {selectedId ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">
                    Recipes in {collections?.find((c) => c.id === selectedId)?.name}
                  </h3>
                  <button
                    onClick={() => { setShowAddRecipe(true); setAddRecipeSearch(""); }}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Add Recipe
                  </button>
                </div>
                {collectionRecipes && collectionRecipes.length > 0 ? (
                  <div className="space-y-2">
                    {collectionRecipes.map((recipe) => (
                      <div key={recipe.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <Link href={`/recipes/${recipe.id}`} className="hover:text-primary font-medium text-sm">{recipe.name}</Link>
                        <div className="flex items-center gap-3">
                          {recipe.cuisine && <span className="text-xs text-muted-foreground">{recipe.cuisine}</span>}
                          <button
                            onClick={() => removeRecipeMutation.mutate({ collId: selectedId, recipeId: recipe.id })}
                            className="p-1 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No recipes in this collection yet.</p>
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a collection to view its recipes</p>
              </div>
            )}
          </div>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
            <div className="bg-card border rounded-lg w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">New Collection</h2>
                <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
              {formError && <div className="mx-4 mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded">{formError}</div>}
              <form onSubmit={handleCreateSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} required className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., Weeknight Dinners" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90">Create</button>
                  <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-md text-sm hover:bg-accent">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editId && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
            <div className="bg-card border rounded-lg w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Edit Collection</h2>
                <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={handleEditSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} required className="w-full px-3 py-2 border rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90">Save</button>
                  <button type="button" onClick={() => setEditId(null)} className="px-4 py-2 border rounded-md text-sm hover:bg-accent">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Recipe to Collection Modal */}
        {showAddRecipe && selectedId && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
            <div className="bg-card border rounded-lg w-full max-w-md max-h-[60vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Add Recipe to Collection</h2>
                <button onClick={() => setShowAddRecipe(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4">
                <input
                  value={addRecipeSearch}
                  onChange={(e) => setAddRecipeSearch(e.target.value)}
                  placeholder="Search recipes..."
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  autoFocus
                />
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
                {searchResults?.items?.map((recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() => { addRecipeMutation.mutate({ collId: selectedId, recipeId: recipe.id }); setShowAddRecipe(false); }}
                    className="w-full text-left p-2 rounded hover:bg-accent text-sm"
                  >
                    {recipe.name}
                    {recipe.cuisine && <span className="text-xs text-muted-foreground ml-2">{recipe.cuisine}</span>}
                  </button>
                ))}
                {addRecipeSearch.length > 1 && searchResults?.items?.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No recipes found</p>
                )}
                {addRecipeSearch.length <= 1 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Type to search recipes</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
