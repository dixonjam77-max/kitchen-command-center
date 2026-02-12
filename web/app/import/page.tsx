"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/shared/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";
import {
  Upload, Download, FileText, FileSpreadsheet,
  Sparkles, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type ImportTarget = "pantry" | "tools" | "recipes" | "grocery";

interface ImportResult {
  imported: number;
  errors?: string[];
  items?: { name: string; category?: string | null; cuisine?: string | null }[];
  message?: string;
}

export default function ImportExportPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"csv" | "text">("csv");
  const [importTarget, setImportTarget] = useState<ImportTarget>("pantry");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/login");
  }, [isLoading, isAuthenticated, router]);

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(`${API_BASE}/import/${importTarget}/csv`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleTextImport() {
    if (!pastedText.trim()) return;

    setImporting(true);
    setResult(null);
    setError(null);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const formData = new URLSearchParams();
      formData.append("doc_type", importTarget);
      formData.append("text", pastedText);

      const res = await fetch(`${API_BASE}/import/google-doc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData.toString(),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data);
      setPastedText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function handleExport(type: "pantry" | "tools" | "recipes") {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const url = `${API_BASE}/import/${type}/csv`;
    // Use a hidden anchor with auth header via fetch
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${type}_export.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert("Export failed. Please try again."));
  }

  if (isLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex">
      <Navigation />
      <main className="flex-1 p-8 overflow-auto max-h-screen">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold mb-1">Import &amp; Export</h2>
          <p className="text-muted-foreground mb-6">
            Import data from CSV files or paste text from Google Docs. Export your data as CSV.
          </p>

          {/* Tab switcher */}
          <div className="flex gap-1 mb-6 border-b">
            {[
              { key: "csv" as const, label: "CSV Import", icon: FileSpreadsheet },
              { key: "text" as const, label: "Text / Google Docs", icon: FileText },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setActiveTab(key); setResult(null); setError(null); }}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Target selector */}
          <div className="mb-6">
            <label className="text-sm font-medium mb-2 block">Import into:</label>
            <div className="flex gap-2">
              {(["pantry", "tools", "recipes", ...(activeTab === "text" ? ["grocery"] : [])] as ImportTarget[]).map((target) => (
                <button
                  key={target}
                  onClick={() => { setImportTarget(target); setResult(null); }}
                  className={`px-3 py-1.5 text-sm rounded-md capitalize ${
                    importTarget === target
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent hover:bg-accent/80"
                  }`}
                >
                  {target}
                </button>
              ))}
            </div>
          </div>

          {/* CSV Import */}
          {activeTab === "csv" && (
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm mb-2">
                  Upload a CSV file with your {importTarget} data
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  {importTarget === "pantry" && "Columns: name, category, quantity, unit, location, brand, expiration_date, notes"}
                  {importTarget === "tools" && "Columns: name, category, brand, model, condition, location, capabilities (;-separated), notes"}
                  {importTarget === "recipes" && "Columns: name, description, servings, cuisine, difficulty, tags (;-separated), ingredients (;-separated), instructions (|-separated)"}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  className="hidden"
                  id="csv-file"
                />
                <label
                  htmlFor="csv-file"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm cursor-pointer hover:bg-primary/90"
                >
                  <Upload className="h-4 w-4" />
                  {importing ? "Importing..." : "Choose CSV File"}
                </label>
              </div>
            </div>
          )}

          {/* Text / Google Docs Import */}
          {activeTab === "text" && (
            <div className="space-y-4">
              <div className="border rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">AI-Powered Text Import</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Paste text from Google Docs, notes, emails, or any source. Our AI will extract
                  structured {importTarget} data automatically.
                </p>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Paste your ${importTarget} list or text here...`}
                  className="w-full h-48 px-3 py-2 border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex justify-end mt-3">
                  <button
                    onClick={handleTextImport}
                    disabled={importing || !pastedText.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Import with AI</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="mt-6 border rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-sm font-semibold text-green-700">
                  Successfully imported {result.imported} item{result.imported !== 1 ? "s" : ""}
                </span>
              </div>
              {result.message && (
                <p className="text-sm text-muted-foreground mb-3">{result.message}</p>
              )}
              {result.items && result.items.length > 0 && (
                <div className="max-h-40 overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {result.items.map((item, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-accent rounded">
                        {item.name}
                        {item.category && <span className="text-muted-foreground ml-1">({item.category})</span>}
                        {item.cuisine && <span className="text-muted-foreground ml-1">({item.cuisine})</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.errors && result.errors.length > 0 && (
                <div className="mt-3 text-xs text-yellow-600">
                  <p className="font-medium mb-1">{result.errors.length} warning(s):</p>
                  <ul className="space-y-0.5">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errors.length > 5 && <li>...and {result.errors.length - 5} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-6 border border-red-200 rounded-lg p-5 bg-red-50">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            </div>
          )}

          {/* ── Export Section ─────────────────────────────────── */}
          <div className="mt-10 pt-8 border-t">
            <h3 className="text-lg font-semibold mb-1">Export Data</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Download your data as CSV files for backup or migration.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { type: "pantry" as const, label: "Pantry Items" },
                { type: "tools" as const, label: "Kitchen Tools" },
                { type: "recipes" as const, label: "Recipes" },
              ].map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => handleExport(type)}
                  className="flex items-center gap-3 p-4 border rounded-lg hover:bg-accent text-left"
                >
                  <Download className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">Download CSV</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
