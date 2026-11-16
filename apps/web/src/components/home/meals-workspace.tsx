import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { Meal } from "@/lib/meals";
import type { SimilarMealsResponse } from "@/lib/meal-comparison";
import { RecentMealsSheet } from "./recent-meals-sheet";
import { MealFollowUpCard } from "./meal-follow-up-card";
import { MealComparisonCard } from "./meal-comparison-card";
import { HomeCardHeader } from "./home-card-header";
import styles from "./home-workflow.module.css";

export function MealsWorkspace({ token, onDirty, active, onUpdated }: { token: string; onDirty: (value: boolean) => void; active: boolean; onUpdated: (meal: Meal) => void }) {
  const [meal, setMeal] = useState<Meal | null>(null);
  const [view, setView] = useState<"list" | "details" | "compare">("list");
  const [history, setHistory] = useState<SimilarMealsResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const opening = useRef(0);
  const id = meal?.id;
  useEffect(() => {
    if (view !== "compare" || !id) return;
    let active = true;
    const request = new AbortController();
    async function load() {
      setLoading(true); setError(""); setHistory(null);
      await apiRequest<SimilarMealsResponse>(`/meals/${id}/similar`, token, { method: "POST", signal: AbortSignal.any([request.signal, AbortSignal.timeout(100_000)]) })
        .then((result) => { if (active) setHistory(result); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load comparisons."); })
        .finally(() => { if (active) setLoading(false); });
    }
    void load();
    return () => { active = false; request.abort(); };
  }, [id, token, view, revision]);

  function back() {
    if (dirty && !window.confirm("Discard these unsaved meal details?")) return;
    ++opening.current; setDirty(false); onDirty(false); setView("list"); setError("");
  }
  if (view === "list") return <RecentMealsSheet key={revision} active={active} token={token} onDetails={(value) => { setMeal(value); setView("details"); }} onOpen={(mealId) => {
    const version = ++opening.current;
    setLoading(true); setView("compare"); setMeal(null); setError("");
    void apiRequest<Meal>(`/meals/${mealId}`, token).then((value) => { if (version !== opening.current) return; setMeal(value); setSelected(null); }).catch((cause) => { if (version !== opening.current) return; setError(cause instanceof Error ? cause.message : "Could not open meal."); setLoading(false); });
  }} />;
  if (!meal) return <><HomeCardHeader title="Saved meal" description="Opening your meal journal." back={{ label: "Recent meals", onClick: back }} /><div className={styles.body}><p role={error ? "alert" : "status"}>{error || "Opening meal…"}</p></div></>;
  if (view === "details") return <MealFollowUpCard key={meal.id} meal={meal} token={token} backLabel="Recent meals" onBack={back} onDirty={(value) => { setDirty(value); onDirty(value); }} onSaved={(value) => { onUpdated(value); setMeal(value); setDirty(false); onDirty(false); setRevision((n) => n + 1); setView("list"); }} />;
  return <MealComparisonCard meal={meal} token={token} history={history} loading={loading} error={error} selectedId={selected} onSelect={setSelected} onRetry={() => setRevision((n) => n + 1)} onFollowUp={() => setView("details")} onBack={back} active={active} />;
}
