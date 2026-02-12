"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Check, Package, ShoppingCart, Split,
  Loader2, X, Trash2,
} from "lucide-react";
import { Navigation } from "@/components/shared/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";
import Link from "next/link";

interface GroceryItem {
  id: string;
  list_id: string;
  item_name: string;
  canonical_name: string | null;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  estimated_price: number | null;
  checked: boolean;
  checked_at: string | null;
  added_to_pantry: boolean;
  source: string | null;
  notes: string | null;
}

interface GroceryList {
  id: string;
  name: string;
  status: string;
  store: string | null;
  estimated_cost: number | null;
  notes: string | null;
  items: GroceryItem[];
  created_at: string;
}

const SOURCE_BADGES: Record<string, string> = {
  meal_plan: "bg-blue-50 text-blue-600",
  low_stock: "bg-orange-50 text-orange-600",
  manual: "bg-muted text-muted-foreground",
  ai_suggestion: "bg-purple-50 text-purple-600",
};

export default function GroceryDetailPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const listId = params.id as string;

  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitResult, setSplitResult] = useState<Record<string, unknown[]> | null>(null);
  const [shoppingMode, setShoppingMode] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const { data: list, isLoading } = useQuery({
    queryKey: ["grocery-list", listId],
    queryFn: () => api.get<GroceryList>(`/grocery/${listId}`),
    enabled: isAuthenticated && !!listId,
  });

  const checkMutation = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      api.patch(`/grocery/${listId}/items/${itemId}`, { checked }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grocery-list", listId] }),
  });

  const toPantryMutation = useMutation({
    mutationFn: (itemId: string) => api.post(`/grocery/${listId}/items/${itemId}/to-pantry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-list", listId] });
      queryClient.invalidateQueries({ queryKey: ["pantry-items"] });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (items: Record<string, unknown>[]) => api.post(`/grocery/${listId}/items`, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-list", listId] });
      setShowAddItem(false);
      setNewItemName("");
      setNewItemQty("");
      setNewItemUnit("");
      setNewItemCategory("");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/grocery/${listId}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grocery-list", listId] }),
  });

  async function handleSplit() {
    setSplitLoading(true);
    try {
      const res = await api.post<{ stores: Record<string, unknown[]> }>(`/grocery/${listId}/split-by-store`);
      setSplitResult(res.stores);
    } catch {
      // ignore
    } finally {
      setSplitLoading(false);
    }
  }

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  if (isLoading || !list) {
    return (
      <div className="flex">
        <Navigation />
        <main className="flex-1 p-8"><p className="text-muted-foreground">Loading list...</p></main>
      </div>
    );
  }

  const unchecked = list.items.filter((i) => !i.checked);
  const checked = list.items.filter((i) => i.checked);
  const total = list.items.reduce((s, i) => s + (i.estimated_price || 0), 0);
  const checkedTotal = checked.reduce((s, i) => s + (i.estimated_price || 0), 0);

  // Group unchecked by category
  const categorized = new Map<string, GroceryItem[]>();
  for (const item of unchecked) {
    const cat = item.category || "Other";
    if (!categorized.has(cat)) categorized.set(cat, []);
    categorized.get(cat)!.push(item);
  }

  return (
    <div className="flex">
      {!shoppingMode && <Navigation />}
      <main className={`flex-1 p-8 ${shoppingMode ? "max-w-lg mx-auto" : ""}`}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          {!shoppingMode && (
            <Link href="/grocery" className="p-2 hover:bg-accent rounded-md mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <div className="flex-1">
            <h2 className={`font-bold ${shoppingMode ? "text-xl" : "text-2xl"}`}>{list.name}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              {list.store && <span>{list.store}</span>}
              <span>{unchecked.length} remaining / {list.items.length} total</span>
              {total > 0 && <span>~${total.toFixed(2)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShoppingMode(!shoppingMode)}
              className={`flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm ${shoppingMode ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              <ShoppingCart className="h-4 w-4" /> {shoppingMode ? "Exit Shopping" : "Shopping Mode"}
            </button>
            {!shoppingMode && (
              <>
                <button
                  onClick={handleSplit}
                  disabled={splitLoading}
                  className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-accent"
                >
                  {splitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Split className="h-4 w-4" />}
                  Split by Store
                </button>
                <button
                  onClick={() => setShowAddItem(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
                >
                  <Plus className="h-4 w-4" /> Add Item
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status bar */}
        {!shoppingMode && (
          <div className="flex gap-2 mb-6">
            {["active", "shopping", "completed"].map((status) => (
              <button
                key={status}
                onClick={() => updateStatusMutation.mutate(status)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  list.status === status ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        )}

        {/* Split Result */}
        {splitResult && !shoppingMode && (
          <div className="mb-6 p-4 bg-muted/50 rounded-lg">
            <h3 className="font-semibold mb-3">Store Split Suggestions</h3>
            {Object.entries(splitResult).map(([store, items]) => (
              <div key={store} className="mb-3">
                <h4 className="text-sm font-medium text-primary">{store} ({(items as unknown[]).length} items)</h4>
                <ul className="text-sm text-muted-foreground ml-4 mt-1">
                  {(items as { item_name: string }[]).map((item, i) => (
                    <li key={i}>• {item.item_name}</li>
                  ))}
                </ul>
              </div>
            ))}
            <button onClick={() => setSplitResult(null)} className="text-sm text-muted-foreground hover:underline mt-2">Dismiss</button>
          </div>
        )}

        {/* Progress Bar */}
        {list.items.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{checked.length} of {list.items.length} checked</span>
              {checkedTotal > 0 && <span>${checkedTotal.toFixed(2)} spent</span>}
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${(checked.length / list.items.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Items by category */}
        {[...categorized.entries()].map(([category, items]) => (
          <div key={category} className="mb-6">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">{category}</h3>
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg ${shoppingMode ? "text-lg" : ""}`}
                >
                  <button
                    onClick={() => checkMutation.mutate({ itemId: item.id, checked: true })}
                    className="flex-shrink-0 w-6 h-6 border-2 rounded-full flex items-center justify-center hover:border-green-500 hover:bg-green-50 transition-colors"
                  >
                    {/* empty circle */}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{item.item_name}</span>
                    {item.quantity != null && (
                      <span className="text-muted-foreground ml-2">
                        {item.quantity} {item.unit || ""}
                      </span>
                    )}
                    {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.source && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_BADGES[item.source] || ""}`}>
                        {item.source.replace("_", " ")}
                      </span>
                    )}
                    {item.estimated_price && (
                      <span className="text-xs text-muted-foreground">${item.estimated_price.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Checked items */}
        {checked.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Checked ({checked.length})
            </h3>
            <div className="space-y-1 opacity-60">
              {checked.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                  <button
                    onClick={() => checkMutation.mutate({ itemId: item.id, checked: false })}
                    className="flex-shrink-0 w-6 h-6 border-2 border-green-500 bg-green-500 rounded-full flex items-center justify-center"
                  >
                    <Check className="h-4 w-4 text-white" />
                  </button>
                  <span className="flex-1 line-through text-muted-foreground">{item.item_name}</span>
                  {!item.added_to_pantry && (
                    <button
                      onClick={() => toPantryMutation.mutate(item.id)}
                      disabled={toPantryMutation.isPending}
                      className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent"
                    >
                      <Package className="h-3 w-3" /> Add to Pantry
                    </button>
                  )}
                  {item.added_to_pantry && (
                    <span className="text-xs text-green-600">In pantry</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Item Modal */}
        {showAddItem && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
            <div className="bg-card border rounded-lg w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Add Item</h2>
                <button onClick={() => setShowAddItem(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await addItemMutation.mutateAsync([{
                    item_name: newItemName.trim(),
                    quantity: newItemQty ? parseFloat(newItemQty) : null,
                    unit: newItemUnit || null,
                    category: newItemCategory || null,
                    source: "manual",
                  }]);
                }}
                className="p-4 space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium mb-1">Item Name *</label>
                  <input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} required className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., Swanson Chicken Broth" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Qty</label>
                    <input type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Unit</label>
                    <input value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="oz" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Section</label>
                    <input value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="Produce" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={addItemMutation.isPending} className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {addItemMutation.isPending ? "Adding..." : "Add Item"}
                  </button>
                  <button type="button" onClick={() => setShowAddItem(false)} className="px-4 py-2 border rounded-md text-sm hover:bg-accent">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
