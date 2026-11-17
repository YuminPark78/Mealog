import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookOpen, CloudOff } from "lucide-react";
import { apiRequest } from "@/lib/api";
import type { Meal } from "@/lib/meals";
import styles from "./home-workflow.module.css";
import { HomeCardHeader } from "./home-card-header";

export function RecentMealsSheet({ token, onOpen, onBack, onDetails, active = true }: { token: string; onOpen: (id: string) => void; onBack?: () => void; onDetails?: (meal: Meal) => void; active?: boolean }) {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    let current = true;
    const controller = new AbortController();
    apiRequest<Meal[]>("/meals", token, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then((rows) => { if (current) { setMeals(rows); setError(""); } })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Could not load meals."); });
    return () => { current = false; controller.abort(); };
  }, [token, revision, active]);
  return <><HomeCardHeader title="Recent meals" eyebrow="Your meal journal" description="Revisit comparisons or add details to a saved meal." back={onBack ? { label: "Log a meal", onClick: onBack } : undefined} />
    <section className={styles.recentFrame} aria-label="Recent meal records">
    <div className={`${styles.recentList} space-y-3`}>
      {error ? <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 p-6 text-center">
        <CloudOff aria-hidden="true" className="size-9 text-muted-foreground" strokeWidth={1.25} />
        <h2 className="font-medium">Your meal journal couldn’t load</h2>
        <p role="alert" className="max-w-xs text-sm text-muted-foreground">Your saved meals haven’t been changed. Please try again in a moment.</p>
        <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Try again</Button>
      </div> : meals === null ? <p role="status">Loading meals…</p> : meals.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 p-6 text-center">
        <BookOpen aria-hidden="true" className="size-10 text-muted-foreground" strokeWidth={1.25} />
        <h2 className="text-lg font-medium">Your meal story starts here</h2>
        <p className="max-w-xs text-sm text-muted-foreground">Use the Log a meal tab to add your first meal with a photo or a few details. You’ll find it here whenever you want to look back.</p>
      </div> : meals.map((meal) => <article key={meal.id} className="rounded-xl border p-4">
        <h2 className="font-medium">{meal.name}</h2><p className="mt-1 text-xs text-muted-foreground">{new Date(meal.eaten_at).toLocaleString()} · {meal.carbohydrates_g === null ? "Carbohydrates not recorded" : `${meal.carbohydrates_g} g in serving`}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => onOpen(meal.id)}>View history</Button>{onDetails && <Button className="min-h-11" onClick={() => onDetails(meal)}>Add details</Button>}</div>
      </article>)}
      {meals?.length === 50 && <p className="text-xs text-muted-foreground">Showing your 50 most recent meals.</p>}
    </div></section></>;
}
