"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { Navigation } from "@/components/shared/navigation";
import { ToolForm } from "@/components/tools/tool-form";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";

const TOOL_CATEGORIES = [
  "cookware", "bakeware", "appliances", "utensils", "knives",
  "storage", "small_appliances", "specialty", "barware",
];

const CONDITION_COLORS: Record<string, string> = {
  excellent: "text-green-600 bg-green-50",
  good: "text-blue-600 bg-blue-50",
  fair: "text-yellow-600 bg-yellow-50",
  needs_replacement: "text-red-600 bg-red-50",
};

interface KitchenTool {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  condition: string | null;
  location: string | null;
  purchase_date: string | null;
  capabilities: string[];
  last_maintained: string | null;
  maintenance_interval_days: number | null;
  maintenance_type: string | null;
  notes: string | null;
}

export default function ToolsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editTool, setEditTool] = useState<KitchenTool | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["tools", search, category],
    queryFn: () =>
      api.get<{ items: KitchenTool[]; total: number }>("/tools", {
        search: search || undefined,
        category: category || undefined,
        limit: 100,
      }),
    enabled: isAuthenticated,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/tools/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tools"] }),
  });

  async function handleCreate(payload: Record<string, unknown>) {
    await api.post("/tools", payload);
    queryClient.invalidateQueries({ queryKey: ["tools"] });
    setShowAdd(false);
  }

  async function handleUpdate(payload: Record<string, unknown>) {
    if (!editTool) return;
    await api.patch(`/tools/${editTool.id}`, payload);
    queryClient.invalidateQueries({ queryKey: ["tools"] });
    setEditTool(null);
  }

  function isMaintenanceDue(tool: KitchenTool): boolean {
    if (!tool.maintenance_interval_days) return false;
    if (!tool.last_maintained) return true;
    const last = new Date(tool.last_maintained);
    const due = new Date(last.getTime() + tool.maintenance_interval_days * 86400000);
    return due <= new Date();
  }

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  const tools = data?.items || [];

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Kitchen Tools</h2>
            <p className="text-muted-foreground text-sm">
              {data?.total || 0} tools tracked
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add Tool
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Search tools..."
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
            {TOOL_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        {/* Tools grid */}
        {isLoading ? (
          <p className="text-muted-foreground">Loading tools...</p>
        ) : tools.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No tools yet.</p>
            <button onClick={() => setShowAdd(true)} className="mt-2 text-primary hover:underline text-sm">
              Add your first tool
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <div key={tool.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{tool.name}</h3>
                    {tool.brand && (
                      <p className="text-xs text-muted-foreground">
                        {tool.brand}{tool.model ? ` ${tool.model}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditTool(tool)} className="p-1.5 text-muted-foreground hover:text-foreground rounded">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${tool.name}"?`)) {
                          deleteMutation.mutate(tool.id);
                        }
                      }}
                      className="p-1.5 text-muted-foreground hover:text-destructive rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {tool.category && (
                    <span className="text-xs px-2 py-0.5 bg-muted rounded">
                      {tool.category.replace("_", " ")}
                    </span>
                  )}
                  {tool.condition && (
                    <span className={`text-xs px-2 py-0.5 rounded ${CONDITION_COLORS[tool.condition] || ""}`}>
                      {tool.condition.replace("_", " ")}
                    </span>
                  )}
                </div>
                {tool.capabilities && tool.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {tool.capabilities.map((cap) => (
                      <span key={cap} className="text-xs px-2 py-0.5 border rounded-full text-muted-foreground">
                        {cap}
                      </span>
                    ))}
                  </div>
                )}
                {isMaintenanceDue(tool) && (
                  <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                    <AlertTriangle className="h-3 w-3" />
                    Maintenance due{tool.maintenance_type ? `: ${tool.maintenance_type}` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <ToolForm title="Add Tool" onSubmit={handleCreate} onCancel={() => setShowAdd(false)} />
        )}

        {editTool && (
          <ToolForm
            title="Edit Tool"
            initialData={{
              name: editTool.name,
              category: editTool.category || "",
              brand: editTool.brand || "",
              model: editTool.model || "",
              condition: editTool.condition || "",
              location: editTool.location || "",
              purchase_date: editTool.purchase_date || "",
              capabilities: editTool.capabilities || [],
              maintenance_interval_days: editTool.maintenance_interval_days?.toString() || "",
              maintenance_type: editTool.maintenance_type || "",
              notes: editTool.notes || "",
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditTool(null)}
          />
        )}
      </main>
    </div>
  );
}
