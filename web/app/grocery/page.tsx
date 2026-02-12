"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, ShoppingCart, Trash2, Archive, Loader2, X, Sparkles,
} from "lucide-react";
import { Navigation } from "@/components/shared/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";
import Link from "next/link";

const STATUS_BADGES: Record<string, string> = {
  active: "bg-green-50 text-green-600",
  shopping: "bg-blue-50 text-blue-600",
  completed: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

interface GroceryListSummary {
  id: string;
  name: string;
  status: string;
  store: string | null;
  estimated_cost: number | null;
  item_count: number;
  created_at: string;
}

export default function GroceryPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createStore, setCreateStore] = useState("");
  const [genStartDate, setGenStartDate] = useState("");
  const [genEndDate, setGenEndDate] = useState("");
  const [genListName, setGenListName] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const { data: lists, isLoading } = useQuery({
    queryKey: ["grocery-lists"],
    queryFn: () => api.get<GroceryListSummary[]>("/grocery"),
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; store?: string }) => api.post("/grocery", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-lists"] });
      setShowCreate(false);
      setCreateName("");
      setCreateStore("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/grocery/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grocery-lists"] }),
  });

  async function handleGenerate() {
    setGenLoading(true);
    setGenError("");
    try {
      const res = await api.post<{ list: { id: string } }>("/grocery/generate-from-plan", {
        start_date: genStartDate,
        end_date: genEndDate,
        list_name: genListName || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["grocery-lists"] });
      setShowGenerate(false);
      router.push(`/grocery/${res.list.id}`);
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenLoading(false);
    }
  }

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  const activeLists = (lists || []).filter((l) => l.status !== "archived");

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Grocery Lists</h2>
            <p className="text-muted-foreground text-sm">{activeLists.length} active lists</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-accent"
            >
              <Sparkles className="h-4 w-4" /> From Meal Plan
            </button>
            <button
              onClick={() => { setShowCreate(true); setCreateName(""); setCreateStore(""); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New List
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading lists...</p>
        ) : activeLists.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No grocery lists</p>
            <p className="text-sm mt-1">Create a list or generate one from your meal plan</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeLists.map((list) => (
              <div key={list.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <Link href={`/grocery/${list.id}`} className="flex-1">
                    <h3 className="font-semibold hover:text-primary transition-colors">{list.name}</h3>
                    {list.store && <p className="text-xs text-muted-foreground">{list.store}</p>}
                  </Link>
                  <button
                    onClick={() => { if (confirm(`Delete "${list.name}"?`)) deleteMutation.mutate(list.id); }}
                    className="p-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={`px-2 py-0.5 rounded ${STATUS_BADGES[list.status] || ""}`}>{list.status}</span>
                  <span className="text-muted-foreground">{list.item_count} items</span>
                  {list.estimated_cost && (
                    <span className="text-muted-foreground">~${list.estimated_cost.toFixed(2)}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(list.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
            <div className="bg-card border rounded-lg w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">New Grocery List</h2>
                <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await createMutation.mutateAsync({
                    name: createName.trim(),
                    store: createStore || undefined,
                  });
                }}
                className="p-4 space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input value={createName} onChange={(e) => setCreateName(e.target.value)} required className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., Weekly Groceries" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Store</label>
                  <input value={createStore} onChange={(e) => setCreateStore(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., Meijer, Costco" />
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={createMutation.isPending} className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {createMutation.isPending ? "Creating..." : "Create List"}
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-md text-sm hover:bg-accent">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Generate from Plan Modal */}
        {showGenerate && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
            <div className="bg-card border rounded-lg w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Generate from Meal Plan</h2>
                <button onClick={() => setShowGenerate(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
              {genError && <div className="mx-4 mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded">{genError}</div>}
              <div className="p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  AI will calculate ingredients needed for your planned meals, subtract pantry stock, and use preferred brands.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Start Date *</label>
                    <input type="date" value={genStartDate} onChange={(e) => setGenStartDate(e.target.value)} required className="w-full px-3 py-2 border rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">End Date *</label>
                    <input type="date" value={genEndDate} onChange={(e) => setGenEndDate(e.target.value)} required className="w-full px-3 py-2 border rounded-md text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">List Name</label>
                  <input value={genListName} onChange={(e) => setGenListName(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="Auto-generated if empty" />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleGenerate}
                    disabled={genLoading || !genStartDate || !genEndDate}
                    className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {genLoading ? <span className="flex items-center gap-2 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Generating...</span> : "Generate List"}
                  </button>
                  <button onClick={() => setShowGenerate(false)} className="px-4 py-2 border rounded-md text-sm hover:bg-accent">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
