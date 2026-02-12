"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";

const CUISINES = [
  "american", "italian", "mexican", "chinese", "japanese", "indian",
  "thai", "french", "mediterranean", "korean", "vietnamese", "middle_eastern",
];
const DIFFICULTIES = ["easy", "medium", "hard"];
const DIETARY_FLAGS = [
  "gluten_free", "dairy_free", "vegetarian", "vegan", "low_carb", "keto", "nut_free",
];

interface IngredientRow {
  ingredient_name: string;
  quantity: string;
  unit: string;
  preparation: string;
  group_name: string;
  optional: boolean;
}

interface ToolRow {
  tool_name: string;
  optional: boolean;
  notes: string;
}

interface StepRow {
  step: number;
  text: string;
  duration_minutes: string;
}

interface Props {
  initialData?: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  loading?: boolean;
}

function toIngredientRows(data?: Record<string, unknown>): IngredientRow[] {
  if (!data?.ingredients || !Array.isArray(data.ingredients)) return [emptyIngredient()];
  return (data.ingredients as Record<string, unknown>[]).map((ing) => ({
    ingredient_name: String(ing.ingredient_name || ""),
    quantity: ing.quantity != null ? String(ing.quantity) : "",
    unit: String(ing.unit || ""),
    preparation: String(ing.preparation || ""),
    group_name: String(ing.group_name || ""),
    optional: Boolean(ing.optional),
  }));
}

function toToolRows(data?: Record<string, unknown>): ToolRow[] {
  if (!data?.tools || !Array.isArray(data.tools)) return [];
  return (data.tools as Record<string, unknown>[]).map((t) => ({
    tool_name: String(t.tool_name || ""),
    optional: Boolean(t.optional),
    notes: String(t.notes || ""),
  }));
}

function toStepRows(data?: Record<string, unknown>): StepRow[] {
  if (!data?.instructions || !Array.isArray(data.instructions)) return [emptyStep(1)];
  return (data.instructions as Record<string, unknown>[]).map((s, i) => ({
    step: i + 1,
    text: String(s.text || ""),
    duration_minutes: s.duration_minutes != null ? String(s.duration_minutes) : "",
  }));
}

function emptyIngredient(): IngredientRow {
  return { ingredient_name: "", quantity: "", unit: "", preparation: "", group_name: "", optional: false };
}

function emptyStep(n: number): StepRow {
  return { step: n, text: "", duration_minutes: "" };
}

export function RecipeManualForm({ initialData, onSubmit, loading }: Props) {
  const [name, setName] = useState(String(initialData?.name || ""));
  const [description, setDescription] = useState(String(initialData?.description || ""));
  const [servings, setServings] = useState(String(initialData?.servings || "4"));
  const [prepTime, setPrepTime] = useState(initialData?.prep_time_minutes != null ? String(initialData.prep_time_minutes) : "");
  const [cookTime, setCookTime] = useState(initialData?.cook_time_minutes != null ? String(initialData.cook_time_minutes) : "");
  const [cuisine, setCuisine] = useState(String(initialData?.cuisine || ""));
  const [difficulty, setDifficulty] = useState(String(initialData?.difficulty || ""));
  const [sourceUrl, setSourceUrl] = useState(String(initialData?.source_url || ""));
  const [sourceAttribution, setSourceAttribution] = useState(String(initialData?.source_attribution || ""));
  const [notes, setNotes] = useState(String(initialData?.notes || ""));
  const [tags, setTags] = useState(Array.isArray(initialData?.tags) ? (initialData.tags as string[]).join(", ") : "");
  const [dietaryFlags, setDietaryFlags] = useState<string[]>(
    Array.isArray(initialData?.dietary_flags) ? initialData.dietary_flags as string[] : [],
  );

  const [ingredients, setIngredients] = useState<IngredientRow[]>(toIngredientRows(initialData));
  const [tools, setTools] = useState<ToolRow[]>(toToolRows(initialData));
  const [steps, setSteps] = useState<StepRow[]>(toStepRows(initialData));
  const [error, setError] = useState("");

  function updateIngredient(i: number, field: keyof IngredientRow, value: string | boolean) {
    setIngredients((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  function removeIngredient(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateStep(i: number, field: keyof StepRow, value: string) {
    setSteps((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step: idx + 1 })));
  }

  function updateTool(i: number, field: keyof ToolRow, value: string | boolean) {
    setTools((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  function removeTool(i: number) {
    setTools((prev) => prev.filter((_, idx) => idx !== i));
  }

  function toggleDietary(flag: string) {
    setDietaryFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setError("");

    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description || null,
      servings: parseInt(servings) || 4,
      prep_time_minutes: prepTime ? parseInt(prepTime) : null,
      cook_time_minutes: cookTime ? parseInt(cookTime) : null,
      cuisine: cuisine || null,
      difficulty: difficulty || null,
      source_type: initialData?.source_type || "manual",
      source_url: sourceUrl || null,
      source_attribution: sourceAttribution || null,
      notes: notes || null,
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      dietary_flags: dietaryFlags,
      ingredients: ingredients
        .filter((i) => i.ingredient_name.trim())
        .map((i) => ({
          ingredient_name: i.ingredient_name.trim(),
          quantity: i.quantity ? parseFloat(i.quantity) : null,
          unit: i.unit || null,
          preparation: i.preparation || null,
          group_name: i.group_name || null,
          optional: i.optional,
        })),
      tools: tools
        .filter((t) => t.tool_name.trim())
        .map((t) => ({
          tool_name: t.tool_name.trim(),
          optional: t.optional,
          notes: t.notes || null,
        })),
      instructions: steps
        .filter((s) => s.text.trim())
        .map((s, i) => ({
          step: i + 1,
          text: s.text.trim(),
          duration_minutes: s.duration_minutes ? parseInt(s.duration_minutes) : null,
        })),
    };

    try {
      await onSubmit(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="p-3 bg-destructive/10 text-destructive text-sm rounded">{error}</div>}

      {initialData && (
        <div className="p-3 bg-blue-50 text-blue-700 text-sm rounded">
          Recipe data imported from AI. Review and edit before saving.
        </div>
      )}

      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="font-semibold border-b pb-2">Basic Information</h3>
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., Chicken Tikka Masala" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Servings</label>
            <input type="number" value={servings} onChange={(e) => setServings(e.target.value)} min={1} className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Prep Time (min)</label>
            <input type="number" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cook Time (min)</label>
            <input type="number" value={cookTime} onChange={(e) => setCookTime(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Cuisine</label>
            <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
              <option value="">Select...</option>
              {CUISINES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Difficulty</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
              <option value="">Select...</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., weeknight, comfort food, one-pot" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Dietary Flags</label>
          <div className="flex flex-wrap gap-2">
            {DIETARY_FLAGS.map((flag) => (
              <button
                key={flag}
                type="button"
                onClick={() => toggleDietary(flag)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  dietaryFlags.includes(flag)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground hover:bg-accent"
                }`}
              >
                {flag.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold">Ingredients</h3>
          <button type="button" onClick={() => setIngredients([...ingredients, emptyIngredient()])} className="flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        {ingredients.map((ing, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-12 gap-2">
              <input
                value={ing.quantity}
                onChange={(e) => updateIngredient(i, "quantity", e.target.value)}
                placeholder="Qty"
                className="col-span-2 px-2 py-1.5 border rounded text-sm"
              />
              <input
                value={ing.unit}
                onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                placeholder="Unit"
                className="col-span-2 px-2 py-1.5 border rounded text-sm"
              />
              <input
                value={ing.ingredient_name}
                onChange={(e) => updateIngredient(i, "ingredient_name", e.target.value)}
                placeholder="Ingredient name"
                className="col-span-4 px-2 py-1.5 border rounded text-sm"
              />
              <input
                value={ing.preparation}
                onChange={(e) => updateIngredient(i, "preparation", e.target.value)}
                placeholder="Prep (diced, etc)"
                className="col-span-3 px-2 py-1.5 border rounded text-sm"
              />
              <label className="col-span-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={ing.optional}
                  onChange={(e) => updateIngredient(i, "optional", e.target.checked)}
                  className="rounded"
                />
                Opt
              </label>
            </div>
            <button type="button" onClick={() => removeIngredient(i)} className="p-1.5 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold">Instructions</h3>
          <button type="button" onClick={() => setSteps([...steps, emptyStep(steps.length + 1)])} className="flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-3 w-3" /> Add Step
          </button>
        </div>
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="pt-2 text-sm font-medium text-muted-foreground w-6 text-center">{i + 1}</span>
            <textarea
              value={step.text}
              onChange={(e) => updateStep(i, "text", e.target.value)}
              placeholder={`Step ${i + 1}...`}
              rows={2}
              className="flex-1 px-3 py-2 border rounded-md text-sm"
            />
            <input
              type="number"
              value={step.duration_minutes}
              onChange={(e) => updateStep(i, "duration_minutes", e.target.value)}
              placeholder="min"
              className="w-16 px-2 py-2 border rounded text-sm"
            />
            <button type="button" onClick={() => removeStep(i)} className="p-1.5 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Tools */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold">Tools / Equipment</h3>
          <button type="button" onClick={() => setTools([...tools, { tool_name: "", optional: false, notes: "" }])} className="flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-3 w-3" /> Add Tool
          </button>
        </div>
        {tools.map((tool, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={tool.tool_name}
              onChange={(e) => updateTool(i, "tool_name", e.target.value)}
              placeholder="Tool name"
              className="flex-1 px-3 py-1.5 border rounded text-sm"
            />
            <input
              value={tool.notes}
              onChange={(e) => updateTool(i, "notes", e.target.value)}
              placeholder="Notes"
              className="flex-1 px-3 py-1.5 border rounded text-sm"
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={tool.optional}
                onChange={(e) => updateTool(i, "optional", e.target.checked)}
                className="rounded"
              />
              Optional
            </label>
            <button type="button" onClick={() => removeTool(i)} className="p-1.5 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Source / Attribution */}
      <div className="space-y-4">
        <h3 className="font-semibold border-b pb-2">Source & Notes</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Source URL</label>
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Attribution</label>
            <input value={sourceAttribution} onChange={(e) => setSourceAttribution(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" placeholder="e.g., Serious Eats - J. Kenji López-Alt" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {loading ? "Saving..." : "Save Recipe"}
        </button>
      </div>
    </form>
  );
}
