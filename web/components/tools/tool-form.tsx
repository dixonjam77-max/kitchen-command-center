"use client";

import { useState } from "react";
import { X } from "lucide-react";

const TOOL_CATEGORIES = [
  "cookware", "bakeware", "appliances", "utensils", "knives",
  "storage", "small_appliances", "specialty", "barware",
];

const CAPABILITIES = [
  "sear", "braise", "sous_vide", "grind", "blend", "bake",
  "grill", "smoke", "ferment", "press", "roll", "strain",
];

const CONDITIONS = ["excellent", "good", "fair", "needs_replacement"];

const MAINTENANCE_TYPES = ["sharpen", "season", "descale", "replace_filter"];

interface ToolFormData {
  name: string;
  category: string;
  brand: string;
  model: string;
  condition: string;
  location: string;
  purchase_date: string;
  capabilities: string[];
  maintenance_interval_days: string;
  maintenance_type: string;
  notes: string;
}

interface Props {
  initialData?: Partial<ToolFormData>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  title: string;
}

export function ToolForm({ initialData, onSubmit, onCancel, title }: Props) {
  const [form, setForm] = useState<ToolFormData>({
    name: initialData?.name || "",
    category: initialData?.category || "",
    brand: initialData?.brand || "",
    model: initialData?.model || "",
    condition: initialData?.condition || "",
    location: initialData?.location || "",
    purchase_date: initialData?.purchase_date || "",
    capabilities: initialData?.capabilities || [],
    maintenance_interval_days: initialData?.maintenance_interval_days || "",
    maintenance_type: initialData?.maintenance_type || "",
    notes: initialData?.notes || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update(field: keyof ToolFormData, value: string | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleCapability(cap: string) {
    setForm((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter((c) => c !== cap)
        : [...prev.capabilities, cap],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { name: form.name.trim() };
      if (form.category) payload.category = form.category;
      if (form.brand) payload.brand = form.brand;
      if (form.model) payload.model = form.model;
      if (form.condition) payload.condition = form.condition;
      if (form.location) payload.location = form.location;
      if (form.purchase_date) payload.purchase_date = form.purchase_date;
      if (form.capabilities.length) payload.capabilities = form.capabilities;
      if (form.maintenance_interval_days) payload.maintenance_interval_days = parseInt(form.maintenance_interval_days);
      if (form.maintenance_type) payload.maintenance_type = form.maintenance_type;
      if (form.notes) payload.notes = form.notes;
      await onSubmit(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
      <div className="bg-card border rounded-lg w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-card">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <div className="mx-4 mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded">{error}</div>}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} required className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., Lodge Cast Iron Skillet" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select value={form.category} onChange={(e) => update("category", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select...</option>
                {TOOL_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Condition</label>
              <select value={form.condition} onChange={(e) => update("condition", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select...</option>
                {CONDITIONS.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Brand</label>
              <input value={form.brand} onChange={(e) => update("brand", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Model</label>
              <input value={form.model} onChange={(e) => update("model", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input value={form.location} onChange={(e) => update("location", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., Kitchen drawer" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Purchase Date</label>
              <input type="date" value={form.purchase_date} onChange={(e) => update("purchase_date", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Capabilities</label>
            <div className="flex flex-wrap gap-2">
              {CAPABILITIES.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => toggleCapability(cap)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    form.capabilities.includes(cap)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground hover:bg-accent"
                  }`}
                >
                  {cap.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Maintenance Interval (days)</label>
              <input type="number" value={form.maintenance_interval_days} onChange={(e) => update("maintenance_interval_days", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., 30" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Maintenance Type</label>
              <select value={form.maintenance_type} onChange={(e) => update("maintenance_type", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select...</option>
                {MAINTENANCE_TYPES.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {loading ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={onCancel} className="px-4 py-2 border rounded-md text-sm hover:bg-accent">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
