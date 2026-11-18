import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { apiRequest } from "@/lib/api";
import { fromLocalDateTime, toLocalDateTime } from "@/lib/datetime";
import { ACTIVITY_OPTIONS, type ActivityLevel, type Meal } from "@/lib/meals";
import styles from "./home-workflow.module.css";
import { HomeCardHeader } from "./home-card-header";

type Insulin = { id: string; dose_units: string; insulin_name: string | null; injected_at: string; notes: string | null };
type Props = { meal: Meal; token: string; onSaved: (meal: Meal) => void; onBack: () => void; onDirty: (dirty: boolean) => void; backLabel?: string };

export function MealFollowUpCard(p: Props) {
  const prefix = useId();
  const [editor, setEditor] = useState<"portion" | "activity" | "notes" | "insulin" | null>(null);
  const [events, setEvents] = useState<Insulin[]>([]);
  const [editing, setEditing] = useState<Insulin | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [insulinError, setInsulinError] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [locked, setLocked] = useState(false);
  const attempt = useRef<{ key: string; body: object } | null>(null);
  const saving = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    apiRequest<Insulin[]>(`/insulin-events?meal_id=${p.meal.id}`, p.token, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then((rows) => { if (active) setEvents(rows); })
      .catch(() => { if (active) setInsulinError("Could not load recorded insulin. Reopen this card to try again."); })
      .finally(() => { if (active) setLoadingEvents(false); });
    return () => { active = false; controller.abort(); };
  }, [p.meal.id, p.token]);

  function back() {
    if (locked) {
      setError("Retry this insulin save first to confirm whether it was recorded. This prevents a duplicate entry.");
      return;
    }
    if (editor) {
      if (dirty.current && !window.confirm("Discard these unsaved details?")) return;
      dirty.current = false;
      setEditor(null); setEditing(null); setError(""); p.onDirty(false);
      setActivity(p.meal.activity_after ?? ""); setNote(p.meal.notes ?? "");
    }
    else p.onBack();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const data = new FormData(event.currentTarget);
    setError(""); setBusy(true); saving.current = true;
    try {
      if (editor === "insulin") {
        const body = attempt.current?.body ?? {
          meal_id: p.meal.id, dose_units: String(data.get("dose_units")),
          insulin_name: String(data.get("insulin_name") ?? "").trim() || null,
          injected_at: fromLocalDateTime(String(data.get("injected_at")), editing?.injected_at ?? null),
          notes: String(data.get("insulin_notes") ?? "").trim() || null,
        };
        if (!attempt.current) attempt.current = { key: crypto.randomUUID(), body };
        setLocked(true);
        await apiRequest<Insulin>(editing ? `/insulin-events/${editing.id}` : "/insulin-events", p.token, {
          method: editing ? "PUT" : "POST", body: JSON.stringify(body),
          headers: !editing ? { "Idempotency-Key": attempt.current!.key } : undefined,
        });
        attempt.current = null;
      } else {
        let changes: object;
        if (editor === "portion") {
          const value = String(data.get("fraction_consumed"));
          changes = { fraction_consumed: value === "" ? null : Number(value) };
        } else if (editor === "activity") {
          const value = String(data.get("activity_after"));
          changes = { activity_after: value || null, activity_at: value ? fromLocalDateTime(String(data.get("activity_at")), p.meal.activity_at) : null };
        } else {
          const value = String(data.get("notes") ?? "").trim();
          changes = { notes: value || null, notes_at: value ? fromLocalDateTime(String(data.get("notes_at")), p.meal.notes_at) : null };
        }
        const meal = await apiRequest<Meal>(`/meals/${p.meal.id}/context`, p.token, { method: "PATCH", body: JSON.stringify(changes) });
        p.onDirty(false); p.onSaved(meal); return;
      }
      setLocked(false); p.onDirty(false); p.onSaved(p.meal);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save these details. Please try again.");
      // A rejected request can be edited; a timeout may have committed.
      if (cause instanceof Error && "status" in cause && Number(cause.status) >= 400 && Number(cause.status) < 500) {
        attempt.current = null; setLocked(false);
      }
    } finally { setBusy(false); saving.current = false; }
  }

  const [activity, setActivity] = useState<ActivityLevel | "">(p.meal.activity_after ?? "");
  const [note, setNote] = useState(p.meal.notes ?? "");
  const title = editor === "portion" ? "How much did you eat?" : editor === "activity" ? "Activity after eating" : editor === "notes" ? "Meal note" : editor === "insulin" ? editing ? "Edit insulin entry" : "Record insulin" : "Add meal details";

  return <>
    <HomeCardHeader title={title} description={`${p.meal.name} · Already saved`}
      back={{ label: editor ? "Meal details" : p.backLabel ?? "Similar meals", onClick: back, disabled: busy }} />
    <div className={styles.body}>
      {!editor ? <div className="space-y-3">
        <p className="mb-5 text-sm text-muted-foreground">Add what happened when you’re ready. Everything here is optional.</p>
        {([ ["portion", "Portion eaten", p.meal.fraction_consumed === null ? "Not recorded" : `${p.meal.fraction_consumed * 100}% of your serving`], ["activity", "Activity", p.meal.activity_after?.replaceAll("_", " ") ?? "Not recorded"], ["notes", "Note", p.meal.notes ? "Recorded" : "Not recorded"] ] as const).map(([key, label, summary]) =>
          <button key={key} type="button" className="flex min-h-16 w-full items-center justify-between rounded-xl border px-4 text-left" onClick={() => setEditor(key)}><span><span className="block font-medium">{label}</span><span className="text-xs text-muted-foreground">{summary}</span></span><ChevronRight aria-hidden="true" className="size-4" /></button>)}
        <Button variant="outline" className="min-h-12 w-full" disabled={loadingEvents || !!insulinError} onClick={() => { setEditing(null); setEditor("insulin"); }}>Add insulin entry</Button>
        {loadingEvents && <p role="status" className="text-sm">Loading recorded insulin…</p>}
        {insulinError && <p role="alert" className="text-sm text-destructive">{insulinError}</p>}
        {events.map((entry) => <button key={entry.id} type="button" className="w-full rounded-lg border p-3 text-left text-sm" onClick={() => { setEditing(entry); setEditor("insulin"); }}><span className="font-medium">{entry.dose_units} units · {entry.insulin_name ?? "Insulin"}</span><span className="block text-xs text-muted-foreground">{new Date(entry.injected_at).toLocaleString()} · Edit entry</span></button>)}
      </div> : <form key={`${editor}-${editing?.id ?? "new"}`} id={prefix + "-meal-follow-up"} onSubmit={save} onChange={() => { dirty.current = true; p.onDirty(true); }}>
        <FieldGroup>
          {editor === "portion" && <Field><FieldLabel htmlFor={prefix + "-portion-eaten"}>Amount actually eaten</FieldLabel><select id={prefix + "-portion-eaten"} name="fraction_consumed" defaultValue={p.meal.fraction_consumed ?? ""} disabled={busy} className="min-h-11 rounded-lg border bg-background px-3"><option value="">Not recorded</option><option value="0">None</option><option value="0.25">One quarter</option><option value="0.5">Half</option><option value="0.75">Three quarters</option><option value="1">All</option></select></Field>}
          {editor === "activity" && <><Field><FieldLabel htmlFor={prefix + "-activity"}>Activity</FieldLabel><select id={prefix + "-activity"} name="activity_after" value={activity} disabled={busy} onChange={(e) => setActivity(e.target.value as ActivityLevel | "")} className="min-h-11 rounded-lg border bg-background px-3"><option value="">Not recorded</option>{ACTIVITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><Field><FieldLabel htmlFor={prefix + "-activity-time"}>When did it happen?</FieldLabel><Input id={prefix + "-activity-time"} name="activity_at" type="datetime-local" step="60" defaultValue={toLocalDateTime(p.meal.activity_at ?? new Date().toISOString())} required={!!activity} disabled={busy || !activity} /></Field></>}
          {editor === "notes" && <><Field><FieldLabel htmlFor={prefix + "-meal-note"}>Note</FieldLabel><textarea id={prefix + "-meal-note"} name="notes" className="min-h-24 rounded-lg border bg-background p-3" maxLength={2000} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} /></Field><Field><FieldLabel htmlFor={prefix + "-note-time"}>When does the note apply?</FieldLabel><Input id={prefix + "-note-time"} name="notes_at" type="datetime-local" step="60" defaultValue={toLocalDateTime(p.meal.notes_at ?? new Date().toISOString())} required={!!note.trim()} disabled={busy || !note.trim()} /></Field></>}
          {editor === "insulin" && <>
            <p className="text-sm text-muted-foreground">Record insulin already administered. This does not suggest a dose.</p>
            <Field><FieldLabel htmlFor={prefix + "-dose"}>Dose — units</FieldLabel><Input id={prefix + "-dose"} name="dose_units" type="number" inputMode="decimal" min="0.001" max="99999.999" step="0.001" required defaultValue={editing?.dose_units ?? ""} disabled={busy || locked} /></Field>
            <Field><FieldLabel htmlFor={prefix + "-insulin-name"}>Insulin name — optional</FieldLabel><Input id={prefix + "-insulin-name"} name="insulin_name" maxLength={100} defaultValue={editing?.insulin_name ?? ""} disabled={busy || locked} /></Field>
            <Field><FieldLabel htmlFor={prefix + "-injected-at"}>Injection time</FieldLabel><Input id={prefix + "-injected-at"} name="injected_at" type="datetime-local" step="60" required defaultValue={toLocalDateTime(editing?.injected_at ?? new Date().toISOString())} disabled={busy || locked} /></Field>
            <Field><FieldLabel htmlFor={prefix + "-insulin-notes"}>Notes — optional</FieldLabel><Input id={prefix + "-insulin-notes"} name="insulin_notes" maxLength={2000} defaultValue={editing?.notes ?? ""} disabled={busy || locked} /></Field>
          </>}
        </FieldGroup>
      </form>}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
    <div className={styles.actions}>{editor ? <Button form={prefix + "-meal-follow-up"} type="submit" disabled={busy} className="min-h-12 w-full">{busy ? "Saving…" : locked ? "Retry save" : "Save details"}</Button> : <Button className="min-h-11 w-full" onClick={p.onBack}>{p.backLabel ? `Return to ${p.backLabel.toLowerCase()}` : "Return to comparisons"}</Button>}</div>
  </>;
}
