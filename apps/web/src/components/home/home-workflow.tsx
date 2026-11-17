"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { AppNavigation } from "@/components/layout/app-navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { apiRequest, ApiError } from "@/lib/api";
import { toLocalDateTime } from "@/lib/datetime";
import type { Meal } from "@/lib/meals";
import type { SimilarMealsResponse } from "@/lib/meal-comparison";
import { initialWorkflow, workflowReducer, type PhotoDraft, type Step } from "@/lib/meal-workflow";
import { photoBase64, prepareMealPhoto } from "@/lib/meal-photo";
import { MealSourceCard } from "./meal-source-card";
import { MealDetailsCard } from "./meal-details-card";
import { MealComparisonCard } from "./meal-comparison-card";
import { MealFollowUpCard } from "./meal-follow-up-card";
import { MealsWorkspace } from "./meals-workspace";
import { InsulinWorkspace } from "./insulin-workspace";

const homeTabs = [{ id: "log", label: "Log a meal" }, { id: "meals", label: "Meals" }, { id: "insulin", label: "Insulin" }] as const;
type HomeTab = typeof homeTabs[number]["id"];
import styles from "./home-workflow.module.css";

export function HomeWorkflow() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function initialise() {
      try {
        const supabase = getSupabaseBrowser();
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !data.user) { router.replace("/login"); return; }
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
          if (!active) return;
          setSession(next);
          if (!next) router.replace("/login");
        });
        unsubscribe = () => subscription.unsubscribe();
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not load Home."); }
    }
    void initialise();
    return () => { active = false; unsubscribe?.(); };
  }, [router]);
  if (!session) return <main className={styles.shell}><div className={styles.navigation}><AppNavigation active="home" /></div><p role={error ? "alert" : "status"} className="p-5">{error || "Checking your session…"}</p></main>;
  return <MealDeck key={session.user.id} session={session} />;
}

function MealDeck({ session }: { session: Session }) {
  const [state, dispatch] = useReducer(workflowReducer, initialWorkflow);
  const [tab, setTab] = useState<HomeTab>("log");
  const [visited, setVisited] = useState<Set<HomeTab>>(() => new Set(["log"]));
  const [mealsDirty, setMealsDirty] = useState(false);
  const [mealsVersion, setMealsVersion] = useState(0);
  const [insulinDirty, setInsulinDirty] = useState(false);
  const [preview, setPreview] = useState("");
  const [estimate, setEstimate] = useState<PhotoDraft | null>(null);
  const [working, setWorking] = useState<"prepare" | "analyse" | "save" | "open" | null>(null);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [followDirty, setFollowDirty] = useState(false);
  const [locked, setLocked] = useState(false);
  const shell = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const objectUrl = useRef("");
  const controller = useRef<AbortController | null>(null);
  const selection = useRef(0);
  const mounted = useRef(true);
  const resumeStarted = useRef(false);
  const saveAttempt = useRef<{ key: string; body: object } | null>(null);
  const token = session.access_token;
  const dirty = mealsDirty || insulinDirty || followDirty || (!state.saved && (!!preview || !!state.draft.name || !!state.draft.carbs)) || locked;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); controller.current = null; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    function resize() {
      shell.current?.style.setProperty("--home-height", `${viewport?.height ?? window.innerHeight}px`);
      if (shell.current) shell.current.style.top = `${viewport?.offsetTop ?? 0}px`;
    }
    resize(); viewport?.addEventListener("resize", resize); viewport?.addEventListener("scroll", resize);
    return () => { viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize); };
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (document.activeElement?.getAttribute("role") === "tab") return;
      card.current?.querySelector<HTMLElement>("[role=tabpanel]:not([hidden]) h1")?.focus({ preventScroll: true });
    }, 380);
    return () => clearTimeout(timeout);
  }, [state.step]);
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function go(step: Step, direction: "forward" | "backward" = "forward") {
    // Clear the previous error before starting a request. A delayed view-transition
    // callback must not erase an error returned by a fast photo-analysis response.
    setError("");
    transition(() => dispatch({ type: "go", step, direction }), direction);
  }
  function transition(update: () => void, direction: "forward" | "backward" = "forward") {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduced) {
      update();
      if (!reduced) card.current?.animate([{ opacity: 0, transform: `translateX(${direction === "forward" ? 36 : -36}px)` }, { opacity: 1, transform: "translateX(0)" }], { duration: 360, easing: "cubic-bezier(.22,1,.36,1)" });
      return;
    }
    document.documentElement.dataset.homeDirection = direction;
    const animation = document.startViewTransition(() => flushSync(update));
    void animation.finished.catch(() => {}).finally(() => { delete document.documentElement.dataset.homeDirection; });
  }
  function leave() { return !dirty || window.confirm("Leave with unsaved details? Your saved meals will be kept."); }
  function ensureTime() {
    if (!state.draft.eatenAt) dispatch({ type: "draft", changes: { eatenAt: toLocalDateTime(new Date().toISOString()) } });
  }
  async function openMeal(id: string) {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request; setWorking("open"); setError("");
    try {
      const meal = await apiRequest<Meal>(`/meals/${encodeURIComponent(id)}`, token, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) });
      if (!mounted.current || request.signal.aborted) return;
      transition(() => dispatch({ type: "saved", meal }));
      window.history.replaceState(null, "", `/home?meal=${encodeURIComponent(meal.id)}`);
    } catch (cause) { if (!request.signal.aborted && mounted.current) setError(cause instanceof Error ? cause.message : "Could not open this meal."); }
    finally { if (controller.current === request) { controller.current = null; if (mounted.current) setWorking(null); } }
  }
  useEffect(() => {
    if (resumeStarted.current) return;
    resumeStarted.current = true;
    const id = new URL(window.location.href).searchParams.get("meal");
    if (id) void openMeal(id);
    return () => { resumeStarted.current = false; };
    // Resume only once: token refresh must not reset the deck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savedId = state.saved?.id;
  useEffect(() => {
    if (!savedId) return;
    const request = new AbortController();
    let active = true;
    async function findMatches() {
      setHistoryLoading(true); setHistoryError("");
      try {
        const history = await apiRequest<SimilarMealsResponse>(`/meals/${savedId}/similar`, token, { method: "POST", signal: AbortSignal.any([request.signal, AbortSignal.timeout(100_000)]) });
        if (active) dispatch({ type: "history", history });
      } catch (cause) { if (active) setHistoryError(cause instanceof Error ? cause.message : "Could not retrieve comparisons."); }
      finally { if (active) setHistoryLoading(false); }
    }
    void findMatches();
    return () => { active = false; request.abort(); };
  }, [savedId, token, revision]);

  async function choosePhoto(file: File) {
    const version = ++selection.current;
    controller.current?.abort(); controller.current = null; setWorking("prepare"); setError("");
    try {
      const prepared = await prepareMealPhoto(file);
      if (!mounted.current || selection.current !== version) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(prepared);
      setPreview(objectUrl.current); setEstimate(null);
      dispatch({ type: "draft", changes: { name: "", carbs: "", picturedCarbs: null, share: "1" } }); ensureTime();
      await analyse(prepared);
    } catch (cause) { if (mounted.current && selection.current === version) setError(cause instanceof Error ? cause.message : "Could not prepare this photo."); }
    finally { if (mounted.current && selection.current === version) setWorking(null); }
  }
  function manual() { ++selection.current; controller.current?.abort(); controller.current = null; setWorking(null); ensureTime(); go("review"); }
  async function analyse(photo: Blob) {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request;
    ensureTime(); go("review"); setWorking("analyse"); setEstimate(null);
    try {
      const image = await photoBase64(photo);
      if (request.signal.aborted) return;
      const result = await apiRequest<PhotoDraft>("/meal-estimates", token, { method: "POST", body: JSON.stringify({ image_base64: image, context: "" }), signal: AbortSignal.any([request.signal, AbortSignal.timeout(95_000)]) });
      if (!mounted.current || request.signal.aborted) return;
      setEstimate(result);
      if (result.status !== "not_food") dispatch({ type: "draft", changes: { name: result.name ?? "", carbs: result.carbohydrates_g === null ? "" : String(result.carbohydrates_g), picturedCarbs: result.carbohydrates_g, share: "1" } });
      if (result.status !== "estimated") setError(`${result.message} You can enter details manually or return to your photo.`);
    } catch (cause) { if (mounted.current && !request.signal.aborted) setError(`${cause instanceof Error ? cause.message : "Photo analysis failed."} You can enter the meal manually.`); }
    finally { if (controller.current === request) { controller.current = null; if (mounted.current) setWorking(null); } }
  }
  async function save() {
    if (controller.current || state.saved) return;
    const request = new AbortController(); controller.current = request; setWorking("save"); setError("");
    try {
      if (!saveAttempt.current) saveAttempt.current = { key: crypto.randomUUID(), body: {
        name: state.draft.name.trim(), carbohydrates_g: state.draft.carbs === "" ? null : Number(state.draft.carbs),
        eaten_at: new Date(state.draft.eatenAt).toISOString(), fraction_consumed: null, notes: null,
      } };
      setLocked(true);
      const meal = await apiRequest<Meal>("/meals", token, { method: "POST", headers: { "Idempotency-Key": saveAttempt.current.key }, body: JSON.stringify(saveAttempt.current.body), signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]) });
      if (!mounted.current || request.signal.aborted) return;
      saveAttempt.current = null; setLocked(false); transition(() => dispatch({ type: "saved", meal }));
      window.history.replaceState(null, "", `/home?meal=${encodeURIComponent(meal.id)}`);
    } catch (cause) {
      if (!mounted.current || request.signal.aborted) return;
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) { saveAttempt.current = null; setLocked(false); setError(cause.message); }
      else setError("Saving was interrupted. Retry to confirm your saved meal without creating a duplicate.");
    } finally { if (controller.current === request) { controller.current = null; if (mounted.current) setWorking(null); } }
  }
  function startNew() {
    if ((followDirty || (!state.saved && (preview || state.draft.name || state.draft.carbs)) || locked) && !window.confirm("Discard this unsaved meal draft?")) return;
    controller.current?.abort(); controller.current = null; ++selection.current;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = ""; setPreview(""); setEstimate(null);
    saveAttempt.current = null; setLocked(false); setError(""); setWorking(null); setFollowDirty(false);
    transition(() => { dispatch({ type: "new" }); setTab("log"); }, "backward"); window.history.replaceState(null, "", "/home");
  }

  function switchTab(next: HomeTab) {
    if (next === "meals") {
      if (mealsDirty && !window.confirm("Return to recent meals and discard these unsaved meal details?")) return;
      transition(() => {
        setMealsDirty(false); setMealsVersion((version) => version + 1);
        setVisited((previous) => new Set([...previous, next])); setTab(next);
      });
      return;
    }
    if (next === "log" && state.saved) { startNew(); return; }
    if (next === tab) return;
    // Keep each workspace mounted: switching a bookmark never discards a draft.
    transition(() => { setVisited((previous) => new Set([...previous, next])); setTab(next); });
  }

  return <main ref={shell} className={styles.shell}>
    <div className={styles.navigation}><AppNavigation active="home" onLeave={leave} /></div>
    <div className={styles.viewport}><div ref={card} className={styles.card} data-direction={state.direction}>
      <section id="home-panel-log" role="tabpanel" aria-labelledby="home-tab-log" hidden={tab !== "log"} className={styles.panel}>
      {error && <p role="alert" className="mx-5 mt-4 shrink-0 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {working === "open" ? <div className={styles.body}><p role="status">Opening saved meal…</p></div> : <>
        {state.step === "source" && <MealSourceCard preview={preview} busy={working !== null} onPhoto={(file) => void choosePhoto(file)} onManual={manual} />}
        {state.step === "review" && <MealDetailsCard preview={preview} onPhoto={(file) => void choosePhoto(file)} draft={state.draft} estimate={estimate} analysing={working === "analyse"} saving={working === "save"} locked={locked} onChange={(changes) => dispatch({ type: "draft", changes })} onBack={() => { controller.current?.abort(); controller.current = null; setWorking(null); go("source", "backward"); }} onSave={() => void save()} onManual={manual} />}
        {state.step === "compare" && state.saved && <MealComparisonCard key={`${state.saved.id}-${revision}`} selectedId={state.selectedMatch} onSelect={(id) => dispatch({ type: "select-match", id })} token={token} meal={state.saved} history={state.history} loading={historyLoading || (!state.history && !historyError)} error={historyError} onRetry={() => setRevision((value) => value + 1)} onFollowUp={() => go("follow-up")} active={tab === "log"} />}
        {state.step === "follow-up" && state.saved && <MealFollowUpCard key={state.saved.id} meal={state.saved} token={token} onDirty={setFollowDirty} onBack={() => { if (leave()) { setFollowDirty(false); go("compare", "backward"); } }} onSaved={(meal) => { dispatch({ type: "updated", meal }); setFollowDirty(false); setRevision((value) => value + 1); go("compare", "backward"); }} />}
      </>}
      </section>
      <section id="home-panel-meals" role="tabpanel" aria-labelledby="home-tab-meals" hidden={tab !== "meals"} className={styles.panel}>
        {visited.has("meals") && <MealsWorkspace key={mealsVersion} active={tab === "meals"} token={token} onUpdated={(meal) => { if (state.saved?.id === meal.id) { dispatch({ type: "updated", meal }); setRevision((n) => n + 1); } }} onDirty={setMealsDirty} />}
      </section>
      <section id="home-panel-insulin" role="tabpanel" aria-labelledby="home-tab-insulin" hidden={tab !== "insulin"} className={styles.panel}>
        {visited.has("insulin") && <InsulinWorkspace active={tab === "insulin"} token={token} onDirty={setInsulinDirty} />}
      </section>
    </div>
    <div role="tablist" aria-label="Home sections" className={styles.bookmarks}>
      {homeTabs.map((item, index) => <button key={item.id} id={`home-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`home-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} className={styles.bookmark} onClick={() => switchTab(item.id)} onKeyDown={(event) => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % homeTabs.length;
        else if (event.key === "ArrowLeft") next = (index + homeTabs.length - 1) % homeTabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = homeTabs.length - 1;
        else return;
        event.preventDefault(); switchTab(homeTabs[next].id);
        document.getElementById(`home-tab-${homeTabs[next].id}`)?.focus();
      }}>{item.label}</button>)}
    </div>
    </div>
  </main>;
}
