"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { Navigation } from "@/components/shared/navigation";
import { PantryForm } from "@/components/pantry/pantry-form";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";

const FRESHNESS_COLORS: Record<string, string> = {
  fresh: "bg-green-500",
  use_soon: "bg-yellow-500",
  use_today: "bg-orange-500",
  expired: "bg-red-500",
};

const CATEGORIES = [
  "produce", "dairy", "meat", "seafood", "grains", "spices",
  "canned", "frozen", "condiments", "baking", "beverages",
  "snacks", "oils", "asian_pantry", "latin_pantry", "preserved", "alcohol",
];

const LOCATIONS = ["fridge", "freezer", "pantry", "spice_rack", "counter", "bar", "garage"];

interface PantryItem {
  id: string;
  name: string;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  location: string | null;
  brand: string | null;
  freshness_status: string | null;
  expiration_date: string | null;
  is_staple: boolean;
  subcategory: string | null;
  purchase_date: string | null;
  min_quantity: string | null;
  preferred_brand: string | null;
  batch_info: string | null;
  notes: string | null;
  opened_date: string | null;
}

export default function PantryPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<PantryItem | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["pantry-items", search, category, location],
    queryFn: () =>
      api.get<{ items: PantryItem[]; total: number }>("/pantry", {
        search: search || undefined,
        category: category || undefined,
        location: location || undefined,
        limit: 100,
      }),
    enabled: isAuthenticated,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/pantry/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pantry-items"] }),
  });

  async function handleCreate(payload: Record<string, unknown>) {
    await api.post("/pantry", payload);
    queryClient.invalidateQueries({ queryKey: ["pantry-items"] });
    setShowAdd(false);
  }

  async function handleUpdate(payload: Record<string, unknown>) {
    if (!editItem) return;
    await api.patch(`/pantry/${editItem.id}`, payload);
    queryClient.invalidateQueries({ queryKey: ["pantry-items"] });
    setEditItem(null);
  }

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  const items = data?.items || [];

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Pantry</h2>
            <p className="text-muted-foreground text-sm">
              {data?.total || 0} items tracked
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add Item
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace("_", " ")}</option>
            ))}
          </select>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">All locations</option>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>{l.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        {/* Items table */}
        {isLoading ? (
          <p className="text-muted-foreground">Loading items...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No pantry items yet.</p>
            <button onClick={() => setShowAdd(true)} className="mt-2 text-primary hover:underline text-sm">
              Add your first item
            </button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Item</th>
                  <th className="text-left p-3 font-medium">Category</th>
                  <th className="text-left p-3 font-medium">Qty</th>
                  <th className="text-left p-3 font-medium">Location</th>
                  <th className="text-left p-3 font-medium">Freshness</th>
                  <th className="p-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-accent/50">
                    <td className="p-3">
                      <div className="font-medium">{item.name}</div>
                      {item.brand && <div className="text-xs text-muted-foreground">{item.brand}</div>}
                    </td>
                    <td className="p-3 text-muted-foreground">{item.category?.replace("_", " ") || "—"}</td>
                    <td className="p-3">
                      {item.quantity != null ? `${item.quantity} ${item.unit || ""}`.trim() : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">{item.location?.replace("_", " ") || "—"}</td>
                    <td className="p-3">
                      <span className="flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${FRESHNESS_COLORS[item.freshness_status || "fresh"] || FRESHNESS_COLORS.fresh}`} />
                        <span className="text-xs">{item.freshness_status?.replace("_", " ") || "fresh"}</span>
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditItem(item)}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${item.name}"?`)) {
                              deleteMutation.mutate(item.id);
                            }
                          }}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded"
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

        {/* Add modal */}
        {showAdd && (
          <PantryForm
            title="Add Pantry Item"
            onSubmit={handleCreate}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {/* Edit modal */}
        {editItem && (
          <PantryForm
            title="Edit Pantry Item"
            initialData={{
              name: editItem.name,
              category: editItem.category || "",
              subcategory: editItem.subcategory || "",
              quantity: editItem.quantity?.toString() || "",
              unit: editItem.unit || "",
              location: editItem.location || "",
              brand: editItem.brand || "",
              expiration_date: editItem.expiration_date || "",
              purchase_date: editItem.purchase_date || "",
              min_quantity: editItem.min_quantity?.toString() || "",
              is_staple: editItem.is_staple,
              preferred_brand: editItem.preferred_brand || "",
              batch_info: editItem.batch_info || "",
              notes: editItem.notes || "",
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditItem(null)}
          />
        )}
      </main>
    </div>
  );
}
