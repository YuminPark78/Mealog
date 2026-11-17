import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACTIVITY_OPTIONS, type Meal } from "@/lib/meals";
import type { SimilarMealsResponse } from "@/lib/meal-comparison";
import { HistoricalGlucoseChart, HISTORY_COLORS } from "./historical-glucose-chart";
import type { Snapshot } from "@/components/glucose/meal-glucose-chart";
import { apiRequest, ApiError } from "@/lib/api";
import styles from "./home-workflow.module.css";
import { HomeCardHeader } from "./home-card-header";

type Props = {
  token: string; meal: Meal; history: SimilarMealsResponse | null; loading: boolean; error: string;
  onRetry: () => void; onFollowUp: () => void;
  selectedId: string | null; onSelect: (id: string) => void;
  onBack?: () => void; active?: boolean;
};

export function MealComparisonCard(p: Props) {
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [currentError, setCurrentError] = useState("");
  const [revision, setRevision] = useState(0);
  const touchY = useRef<{ y: number; lastY: number; selected: number } | null>(null);
  const wheel = useRef({ delta: 0, time: 0 });
  const matches = p.history?.matches ?? [];
  const selected = Math.max(0, matches.findIndex((match) => match.meal.id === p.selectedId));

  useEffect(() => {
    if (p.active === false) return;
    let alive = true;
    let request: AbortController | null = null;
    async function load() {
      if (request || document.hidden) return;
      request = new AbortController();
      try {
        const result = await apiRequest<Snapshot>(`/meals/${p.meal.id}/glucose`, p.token, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) });
        if (alive) { setCurrent(result); setCurrentError(""); }
      } catch (cause) {
        if (alive) setCurrentError(cause instanceof ApiError && cause.status === 404 ? "" : "This meal’s glucose could not be refreshed.");
      } finally { request = null; }
    }
    void load();
    const timer = setInterval(() => void load(), 60_000);
    const visible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; request?.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [p.meal.id, p.token, p.active, revision]);

  function choose(index: number) {
    if (!matches.length) return;
    p.onSelect(matches[Math.max(0, Math.min(matches.length - 1, index))].meal.id);
  }
  function endGesture() {
    const gesture = touchY.current;
    touchY.current = null;
    if (gesture && Math.abs(gesture.y - gesture.lastY) >= 40) choose(gesture.selected + Math.sign(gesture.y - gesture.lastY));
  }
  return <>
    <HomeCardHeader action={<Button className="min-h-9 shrink-0 px-2 text-xs" onClick={p.onFollowUp}>Add meal details</Button>} title="Similar meals" eyebrow="Your meal history" status={<><Check className="size-3" aria-hidden="true" />Meal saved</>}
      back={p.onBack ? { label: "Recent meals", onClick: p.onBack } : undefined}
      description={`${p.meal.name}${p.history?.reference_carbohydrates_g != null ? ` · Compared with ${p.history.reference_carbohydrates_g} g ${p.history.basis === "consumed" ? "consumed" : "in your serving"}` : ""}`} />
    <div className={styles.comparisonFrame}>
      <div className={styles.plot} tabIndex={0} aria-label="Glucose graph. Scroll or swipe to browse historical meals." onWheel={(event) => {
        if (!matches.length) return;
        wheel.current.delta += event.deltaY;
        if (Math.abs(wheel.current.delta) >= 40 && performance.now() - wheel.current.time > 180) {
          choose(selected + Math.sign(wheel.current.delta)); wheel.current = { delta: 0, time: performance.now() };
        }
      }} onPointerDown={(event) => {
        if (event.pointerType === "touch") { touchY.current = { y: event.clientY, lastY: event.clientY, selected }; event.currentTarget.setPointerCapture(event.pointerId); }
      }} onPointerMove={(event) => {
        if (event.pointerType !== "touch" || touchY.current === null) return;
        touchY.current.lastY = event.clientY;
      }} onPointerUp={endGesture} onPointerCancel={endGesture} onKeyDown={(event) => {
        if (!matches.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); choose(selected + (event.key === "ArrowDown" ? 1 : -1)); }
      }}>
        <div className={styles.graphLegend}><span><i className={styles.currentSwatch} />This meal · available readings</span><span><i className={styles.historySwatch} />Past meals · U = insulin units</span></div>
        <div className={styles.graphCanvas}><HistoricalGlucoseChart history={p.history} current={current} selected={p.selectedId ? selected : -1} /></div>
      </div>
    {!!matches.length && <span role="status" aria-live="polite" className="sr-only">{selected + 1} of {matches.length}</span>}
    <div className={styles.detailsDeck} aria-label="Historical meal details">
      {!!matches.length && <div className={styles.detailsTrack} style={{ transform: `translateX(-${selected * 100}%)` }}>
      {matches.map((match, index) => <article key={match.meal.id} className={styles.record} aria-hidden={index !== selected} inert={index !== selected} aria-label={`${index + 1} of ${matches.length}: ${match.meal.name}`}>
        <h2 className="truncate font-medium"><button className="max-w-full truncate text-left" aria-pressed={p.selectedId === match.meal.id} onClick={() => p.onSelect(match.meal.id)}><span aria-hidden="true" className="mr-2 inline-block size-2 rounded-full" style={{ background: HISTORY_COLORS[index % HISTORY_COLORS.length] }} />{match.meal.name}</button></h2>
        <p className="mt-1 text-xs text-muted-foreground">{new Date(match.meal.eaten_at).toLocaleString()} · {Math.round(match.consumed_carbohydrates_g)} g eaten{match.snapshot.window.status === "partial" ? " · Partial data" : ""}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <p>Portion eaten: {match.meal.fraction_consumed === null ? "Not recorded" : `${Math.round(match.meal.fraction_consumed * 100)}%`}</p>
          <p>Activity: {ACTIVITY_OPTIONS.find((option) => option.value === match.meal.activity_after)?.label ?? "Not recorded"}{match.meal.activity_at ? ` · ${new Date(match.meal.activity_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
          <p className="line-clamp-2 break-words" title={match.meal.notes ?? undefined}>Note: {match.meal.notes || "Not recorded"}</p>
          <p className="line-clamp-2">Insulin in window: {match.snapshot.injections.length ? match.snapshot.injections.filter((entry) => {
            const minute = (Date.parse(entry.injected_at) - Date.parse(match.meal.eaten_at)) / 60000;
            return minute >= -60 && minute <= 120;
          }).map((entry) => `${entry.dose_units} U at ${new Date(entry.injected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`).join(" · ") || "None recorded" : "None recorded"}</p>
        </div>
      </article>)}
      </div>}
      {!matches.length && <div className={`${styles.emptyGraph} space-y-3`}>
        {p.loading ? <p role="status">Finding similar meals… Your meal is saved.</p> : p.error ? <><p role="alert">Your meal is saved. {p.error}</p><Button variant="outline" onClick={p.onRetry}>Try comparisons again</Button></> : <><h2 className="font-medium">{p.meal.carbohydrates_g === null ? "Carbohydrates not recorded" : "No similar meals yet"}</h2><p className="text-xs text-muted-foreground">{p.meal.carbohydrates_g === null ? "Comparisons need a carbohydrate amount in your serving." : "Keep logging meals to build your history of similar dishes and glucose curves."}</p></>}
      </div>}
    </div>
    </div>
    {currentError && <p role="status" className="px-5 pb-2 text-xs text-muted-foreground">{currentError}<button className="ml-1 underline" onClick={() => setRevision((n) => n + 1)}>Retry glucose</button></p>}
  </>;
}
