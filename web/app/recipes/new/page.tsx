"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, FileText, Globe, Youtube, Camera, Sparkles, Loader2,
} from "lucide-react";
import { Navigation } from "@/components/shared/navigation";
import { RecipeManualForm } from "@/components/recipes/recipe-manual-form";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";
import Link from "next/link";

type Tab = "manual" | "url" | "youtube" | "image" | "generate";

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "manual", label: "Manual", icon: FileText },
  { id: "url", label: "URL Import", icon: Globe },
  { id: "youtube", label: "YouTube", icon: Youtube },
  { id: "image", label: "Photo", icon: Camera },
  { id: "generate", label: "AI Generate", icon: Sparkles },
];

export default function NewRecipePage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("manual");
  const [aiResult, setAiResult] = useState<Record<string, unknown> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // URL import
  const [importUrl, setImportUrl] = useState("");

  // YouTube import
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // Image import
  const [imageBase64, setImageBase64] = useState("");
  const [imagePreview, setImagePreview] = useState("");

  // AI generate
  const [genCuisine, setGenCuisine] = useState("");
  const [genMaxTime, setGenMaxTime] = useState("");
  const [genDifficulty, setGenDifficulty] = useState("");
  const [genDescription, setGenDescription] = useState("");
  const [genDietary, setGenDietary] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/recipes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      router.push("/recipes");
    },
  });

  async function handleAiImport(endpoint: string, body: Record<string, unknown>) {
    setAiLoading(true);
    setAiError("");
    setAiResult(null);
    try {
      const res = await api.post<{ recipe: Record<string, unknown> }>(
        `/recipes${endpoint}`,
        body,
      );
      setAiResult(res.recipe);
      setTab("manual");
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "AI parsing failed");
    } finally {
      setAiLoading(false);
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      const base64 = result.split(",")[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }

  function toggleDietary(flag: string) {
    setGenDietary((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    );
  }

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/recipes" className="p-2 hover:bg-accent rounded-md">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold">New Recipe</h2>
            <p className="text-muted-foreground text-sm">Add manually or import with AI</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {aiError && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded">{aiError}</div>
        )}

        {/* Manual tab */}
        {tab === "manual" && (
          <RecipeManualForm
            initialData={aiResult || undefined}
            onSubmit={async (data) => { await saveMutation.mutateAsync(data); }}
            loading={saveMutation.isPending}
          />
        )}

        {/* URL Import */}
        {tab === "url" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste a recipe URL and AI will extract ingredients, steps, and metadata.
            </p>
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://example.com/recipe/..."
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            <button
              onClick={() => handleAiImport("/parse/url", { url: importUrl })}
              disabled={!importUrl.trim() || aiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              {aiLoading ? "Parsing..." : "Import from URL"}
            </button>
          </div>
        )}

        {/* YouTube Import */}
        {tab === "youtube" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste a YouTube cooking video URL. AI will extract the recipe from the video description and transcript.
            </p>
            <input
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            <button
              onClick={() => handleAiImport("/parse/youtube", { url: youtubeUrl })}
              disabled={!youtubeUrl.trim() || aiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
              {aiLoading ? "Parsing..." : "Import from YouTube"}
            </button>
          </div>
        )}

        {/* Image Import */}
        {tab === "image" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a photo of a recipe (cookbook page, recipe card, or handwritten recipe). AI will OCR and structure it.
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="text-sm"
            />
            {imagePreview && (
              <img src={imagePreview} alt="Recipe preview" className="max-w-sm rounded-md border" />
            )}
            <button
              onClick={() => handleAiImport("/parse/image", { image_base64: imageBase64, media_type: "image/jpeg" })}
              disabled={!imageBase64 || aiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {aiLoading ? "Parsing..." : "Extract Recipe from Image"}
            </button>
          </div>
        )}

        {/* AI Generate */}
        {tab === "generate" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              AI will generate a recipe based on your pantry, tools, and constraints.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Cuisine</label>
                <select value={genCuisine} onChange={(e) => setGenCuisine(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                  <option value="">Any cuisine</option>
                  {["american", "italian", "mexican", "chinese", "japanese", "indian", "thai", "french", "mediterranean", "korean"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Time (minutes)</label>
                <input
                  type="number"
                  value={genMaxTime}
                  onChange={(e) => setGenMaxTime(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <select value={genDifficulty} onChange={(e) => setGenDifficulty(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                  <option value="">Any</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description / Mood</label>
              <textarea
                value={genDescription}
                onChange={(e) => setGenDescription(e.target.value)}
                rows={2}
                placeholder="e.g. Something warm and comforting for a rainy day..."
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Dietary Restrictions</label>
              <div className="flex flex-wrap gap-2">
                {["gluten_free", "dairy_free", "vegetarian", "vegan", "low_carb", "keto", "nut_free"].map((flag) => (
                  <button
                    key={flag}
                    type="button"
                    onClick={() => toggleDietary(flag)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      genDietary.includes(flag)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground hover:bg-accent"
                    }`}
                  >
                    {flag.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() =>
                handleAiImport("/generate", {
                  preferred_cuisine: genCuisine || undefined,
                  max_time_minutes: genMaxTime ? parseInt(genMaxTime) : undefined,
                  difficulty: genDifficulty || undefined,
                  dietary_restrictions: genDietary.length ? genDietary : undefined,
                  description: genDescription || undefined,
                })
              }
              disabled={aiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiLoading ? "Generating..." : "Generate Recipe"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
