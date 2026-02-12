"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  defaultServings?: number;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

export function CookLogForm({ defaultServings, onSubmit, onCancel }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [cookedDate, setCookedDate] = useState(today);
  const [servingsMade, setServingsMade] = useState(defaultServings?.toString() || "");
  const [rating, setRating] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [modifications, setModifications] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSubmit({
        cooked_date: cookedDate,
        servings_made: servingsMade ? parseInt(servingsMade) : null,
        rating: rating ? parseFloat(rating) : null,
        duration_minutes: durationMinutes ? parseInt(durationMinutes) : null,
        modifications: modifications || null,
        notes: notes || null,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
      <div className="bg-card border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Log a Cook</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <div className="mx-4 mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded">{error}</div>}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date *</label>
              <input type="date" value={cookedDate} onChange={(e) => setCookedDate(e.target.value)} required className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Servings Made</label>
              <input type="number" value={servingsMade} onChange={(e) => setServingsMade(e.target.value)} min={1} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Rating (0-5)</label>
              <input type="number" value={rating} onChange={(e) => setRating(e.target.value)} min={0} max={5} step={0.5} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Duration (min)</label>
              <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Modifications</label>
            <textarea value={modifications} onChange={(e) => setModifications(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="What did you change from the original?" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="How did it turn out?" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {loading ? "Saving..." : "Save Cook Log"}
            </button>
            <button type="button" onClick={onCancel} className="px-4 py-2 border rounded-md text-sm hover:bg-accent">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
