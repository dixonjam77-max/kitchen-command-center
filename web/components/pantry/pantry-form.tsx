"use client";

import { useState } from "react";
import { X } from "lucide-react";

const CATEGORIES = [
  "produce", "dairy", "meat", "seafood", "grains", "spices",
  "canned", "frozen", "condiments", "baking", "beverages",
  "snacks", "oils", "asian_pantry", "latin_pantry", "preserved", "alcohol",
];

const LOCATIONS = ["fridge", "freezer", "pantry", "spice_rack", "counter", "bar", "garage"];

const UNITS = ["oz", "lb", "g", "kg", "cups", "tbsp", "tsp", "count", "ml", "L", "bunch", "can", "bottle", "jar"];

interface PantryFormData {
  name: string;
  category: string;
  subcategory: string;
  quantity: string;
  unit: string;
  location: string;
  brand: string;
  expiration_date: string;
  purchase_date: string;
  min_quantity: string;
  is_staple: boolean;
  preferred_brand: string;
  batch_info: string;
  notes: string;
}

interface Props {
  initialData?: Partial<PantryFormData>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  title: string;
}

export function PantryForm({ initialData, onSubmit, onCancel, title }: Props) {
  const [form, setForm] = useState<PantryFormData>({
    name: initialData?.name || "",
    category: initialData?.category || "",
    subcategory: initialData?.subcategory || "",
    quantity: initialData?.quantity || "",
    unit: initialData?.unit || "",
    location: initialData?.location || "",
    brand: initialData?.brand || "",
    expiration_date: initialData?.expiration_date || "",
    purchase_date: initialData?.purchase_date || "",
    min_quantity: initialData?.min_quantity || "",
    is_staple: initialData?.is_staple || false,
    preferred_brand: initialData?.preferred_brand || "",
    batch_info: initialData?.batch_info || "",
    notes: initialData?.notes || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update(field: keyof PantryFormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
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
      if (form.subcategory) payload.subcategory = form.subcategory;
      if (form.quantity) payload.quantity = parseFloat(form.quantity);
      if (form.unit) payload.unit = form.unit;
      if (form.location) payload.location = form.location;
      if (form.brand) payload.brand = form.brand;
      if (form.expiration_date) payload.expiration_date = form.expiration_date;
      if (form.purchase_date) payload.purchase_date = form.purchase_date;
      if (form.min_quantity) payload.min_quantity = parseFloat(form.min_quantity);
      payload.is_staple = form.is_staple;
      if (form.preferred_brand) payload.preferred_brand = form.preferred_brand;
      if (form.batch_info) payload.batch_info = form.batch_info;
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
            <input value={form.name} onChange={(e) => update("name", e.target.value)} required className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., Soy Sauce (Kikkoman)" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select value={form.category} onChange={(e) => update("category", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <select value={form.location} onChange={(e) => update("location", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select...</option>
                {LOCATIONS.map((l) => <option key={l} value={l}>{l.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Quantity</label>
              <input type="number" step="any" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Unit</label>
              <select value={form.unit} onChange={(e) => update("unit", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select...</option>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Min Qty</label>
              <input type="number" step="any" value={form.min_quantity} onChange={(e) => update("min_quantity", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="Low stock alert" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Brand</label>
            <input value={form.brand} onChange={(e) => update("brand", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Expiration Date</label>
              <input type="date" value={form.expiration_date} onChange={(e) => update("expiration_date", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Purchase Date</label>
              <input type="date" value={form.purchase_date} onChange={(e) => update("purchase_date", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Subcategory</label>
            <input value={form.subcategory} onChange={(e) => update("subcategory", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., leafy greens, hard cheese" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_staple} onChange={(e) => update("is_staple", e.target.checked)} id="is_staple" className="rounded" />
            <label htmlFor="is_staple" className="text-sm">Staple item (auto-restock)</label>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Preferred Brand</label>
            <input value={form.preferred_brand} onChange={(e) => update("preferred_brand", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Batch Info</label>
            <input value={form.batch_info} onChange={(e) => update("batch_info", e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., Straw 6.24" />
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
