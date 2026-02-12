"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, ChefHat, Clock, X, Check,
  Volume2, VolumeX, Timer, RotateCcw,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api-client";

interface RecipeIngredient {
  id: string;
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
  preparation: string | null;
  group_name: string | null;
  optional: boolean;
}

interface InstructionStep {
  step: number;
  text: string;
  duration_minutes?: number | null;
  technique?: string | null;
}

interface Recipe {
  id: string;
  name: string;
  servings: number;
  total_time_minutes: number | null;
  instructions: InstructionStep[] | null;
  ingredients: RecipeIngredient[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CookModePage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as string;

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerTarget, setTimerTarget] = useState(0);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const { data: recipe, isLoading } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => api.get<Recipe>(`/recipes/${recipeId}`),
    enabled: isAuthenticated && !!recipeId,
  });

  // Keep screen awake during cooking
  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          const lock = await navigator.wakeLock.request("screen");
          setWakeLock(lock);
        }
      } catch {
        // Wake lock not supported or denied
      }
    }
    requestWakeLock();
    return () => {
      wakeLock?.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step timer
  useEffect(() => {
    if (!timerRunning || timerSeconds === null) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev === null || prev <= 0) {
          setTimerRunning(false);
          // Play notification sound
          try {
            const audio = new Audio("/timer-done.mp3");
            audio.play().catch(() => {});
          } catch {
            // Sound not available
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerRunning, timerSeconds]);

  const steps = recipe?.instructions || [];
  const totalSteps = steps.length;
  const step = steps[currentStep];
  const progress = totalSteps > 0 ? ((completedSteps.size / totalSteps) * 100) : 0;

  const goNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCompletedSteps((prev) => new Set(prev).add(currentStep));
      setCurrentStep((prev) => prev + 1);
      setTimerSeconds(null);
      setTimerRunning(false);
    }
  }, [currentStep, totalSteps]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setTimerSeconds(null);
      setTimerRunning(false);
    }
  }, [currentStep]);

  const toggleStepComplete = useCallback((idx: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const startTimer = useCallback((minutes: number) => {
    const secs = minutes * 60;
    setTimerTarget(secs);
    setTimerSeconds(secs);
    setTimerRunning(true);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        router.push(`/recipes/${recipeId}`);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, router, recipeId]);

  if (authLoading || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  }

  if (isLoading || !recipe) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading recipe...</p>
      </div>
    );
  }

  if (!steps.length) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground">This recipe has no instructions.</p>
        <button onClick={() => router.push(`/recipes/${recipeId}`)} className="text-primary hover:underline">
          Back to recipe
        </button>
      </div>
    );
  }

  const allComplete = completedSteps.size === totalSteps;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card">
        <button
          onClick={() => router.push(`/recipes/${recipeId}`)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" /> Exit Cook Mode
        </button>
        <div className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium truncate max-w-[200px]">{recipe.name}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          Step {currentStep + 1} of {totalSteps}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-accent">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Step content (main area) */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 lg:px-16">
          {/* Step number badge */}
          <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mb-6">
            {step?.step || currentStep + 1}
          </div>

          {/* Step text */}
          <p className="text-xl lg:text-2xl text-center max-w-2xl leading-relaxed mb-8">
            {step?.text}
          </p>

          {/* Step timer */}
          {step?.duration_minutes && (
            <div className="flex flex-col items-center gap-3 mb-8">
              {timerSeconds !== null ? (
                <div className="flex items-center gap-4">
                  <div className={`text-4xl font-mono font-bold ${timerSeconds === 0 ? "text-green-500 animate-pulse" : ""}`}>
                    {formatTime(timerSeconds)}
                  </div>
                  <div className="flex gap-2">
                    {timerRunning ? (
                      <button
                        onClick={() => setTimerRunning(false)}
                        className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-md text-sm"
                      >
                        Pause
                      </button>
                    ) : timerSeconds > 0 ? (
                      <button
                        onClick={() => setTimerRunning(true)}
                        className="px-3 py-1.5 bg-green-100 text-green-700 rounded-md text-sm"
                      >
                        Resume
                      </button>
                    ) : null}
                    <button
                      onClick={() => {
                        setTimerSeconds(timerTarget);
                        setTimerRunning(false);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => startTimer(step.duration_minutes!)}
                  className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-accent"
                >
                  <Timer className="h-4 w-4" />
                  Start {step.duration_minutes} min timer
                </button>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center gap-4 mt-auto pt-8">
            <button
              onClick={goPrev}
              disabled={currentStep === 0}
              className="flex items-center gap-2 px-5 py-2.5 border rounded-lg text-sm hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" /> Previous
            </button>
            {currentStep === totalSteps - 1 ? (
              <button
                onClick={() => {
                  setCompletedSteps((prev) => new Set(prev).add(currentStep));
                  router.push(`/recipes/${recipeId}`);
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                <Check className="h-4 w-4" /> Done Cooking!
              </button>
            ) : (
              <button
                onClick={goNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Use arrow keys or space bar to navigate. Esc to exit.
          </p>
        </div>

        {/* Sidebar: Ingredients + Step overview */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l bg-card p-5 overflow-y-auto max-h-[40vh] lg:max-h-screen">
          {/* Step overview */}
          <h3 className="text-sm font-semibold mb-3">All Steps</h3>
          <div className="space-y-1 mb-6">
            {steps.map((s, i) => (
              <button
                key={i}
                onClick={() => { setCurrentStep(i); setTimerSeconds(null); setTimerRunning(false); }}
                className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded text-xs ${
                  i === currentStep
                    ? "bg-primary/10 text-primary font-medium"
                    : completedSteps.has(i)
                    ? "text-muted-foreground line-through"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <span className="shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] mt-0.5">
                  {completedSteps.has(i) ? <Check className="h-3 w-3 text-green-500" /> : (s.step || i + 1)}
                </span>
                <span className="line-clamp-2">{s.text}</span>
              </button>
            ))}
          </div>

          {/* Ingredients reference */}
          <h3 className="text-sm font-semibold mb-3">Ingredients</h3>
          <ul className="space-y-1.5">
            {recipe.ingredients.map((ing) => (
              <li key={ing.id} className="text-xs flex items-baseline gap-2">
                <span className="font-medium min-w-[3rem] text-right">
                  {ing.quantity != null ? `${ing.quantity} ${ing.unit || ""}`.trim() : ""}
                </span>
                <span className={ing.optional ? "text-muted-foreground" : ""}>
                  {ing.ingredient_name}
                  {ing.preparation && <span className="text-muted-foreground">, {ing.preparation}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Completion overlay */}
      {allComplete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card rounded-2xl p-8 max-w-sm mx-4 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2">All Done!</h2>
            <p className="text-muted-foreground mb-6">
              You&apos;ve completed all {totalSteps} steps. Enjoy your meal!
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => router.push(`/recipes/${recipeId}`)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
              >
                Back to Recipe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
