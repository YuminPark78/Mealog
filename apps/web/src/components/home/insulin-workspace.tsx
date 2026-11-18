import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { apiRequest, ApiError } from "@/lib/api";
import { fromLocalDateTime, toLocalDateTime } from "@/lib/datetime";
import type { Meal } from "@/lib/meals";
import { HomeCardHeader } from "./home-card-header";
import styles from "./home-workflow.module.css";

type Insulin = { id: string; meal_id: string | null; dose_units: string; insulin_name: string | null; injected_at: string; notes: string | null };

export function InsulinWorkspace({ token, onDirty, active }: { token: string; onDirty: (value: boolean) => void; active: boolean }) {
  const [entries, setEntries] = useState<Insulin[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [editing, setEditing] = useState<Insulin | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const dirty = useRef(false);
  const saving = useRef(false);
  const attempt = useRef<{ key: string; body: object } | null>(null);
  useEffect(() => {
    if (!active) return;
    let current = true;
    const request = new AbortController();
    async function load() {
      setLoading(true); setLoadError("");
      // Independent failures must not hide successfully loaded injections.
      await Promise.allSettled([
        apiRequest<Insulin[]>("/insulin-events", token, { signal: request.signal }),
        apiRequest<Meal[]>("/meals", token, { signal: request.signal }),
      ]).then(([injections, journal]) => {
        if (!current) return;
        if (injections.status === "fulfilled") setEntries(injections.value);
        if (journal.status === "fulfilled") setMeals(journal.value);
        if (injections.status === "rejected" || journal.status === "rejected") setLoadError("Some recent records could not be loaded. You can still record insulin without a meal link.");
        setLoading(false);
      });
    }
    void load();
    return () => { current = false; request.abort(); };
  }, [token, revision, active]);

  function select(entry: Insulin | null) {
    if (busy || locked) return;
    if (dirty.current && !window.confirm("Discard this unsaved insulin entry?")) return;
    setEditing(entry); setFormVersion((n) => n + 1); setError(""); setMessage(""); dirty.current = false; onDirty(false);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const data = new FormData(event.currentTarget);
    saving.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (!attempt.current) attempt.current = { key: crypto.randomUUID(), body: {
        meal_id: String(data.get("meal_id") ?? "") || null,
        dose_units: String(data.get("dose_units")),
        insulin_name: String(data.get("insulin_name") ?? "").trim() || null,
        injected_at: fromLocalDateTime(String(data.get("injected_at")), editing?.injected_at ?? null),
        notes: String(data.get("notes") ?? "").trim() || null,
      } };
      setLocked(true); onDirty(true);
      await apiRequest<Insulin>(editing ? `/insulin-events/${editing.id}` : "/insulin-events", token, {
        method: editing ? "PUT" : "POST", body: JSON.stringify(attempt.current.body),
        headers: editing ? undefined : { "Idempotency-Key": attempt.current.key },
      });
      attempt.current = null; setLocked(false); dirty.current = false; onDirty(false);
      setEditing(null); setFormVersion((n) => n + 1); setRevision((n) => n + 1); setMessage("Insulin entry saved.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        attempt.current = null; setLocked(false); setError(cause.message);
      } else setError("Saving was interrupted. Retry to confirm the entry without creating a duplicate.");
    } finally { saving.current = false; setBusy(false); }
  }
  return <>
    <HomeCardHeader eyebrow="Your insulin journal" title={editing ? "Edit insulin entry" : "Record insulin"} description="Record an injection, with or without a meal." />
    <div className={`${styles.body} space-y-5`}>
      {message && <p role="status" className="text-sm">{message}</p>}
      <form id="home-insulin" key={formVersion} onSubmit={save} onChange={() => { dirty.current = true; onDirty(true); setMessage(""); }}>
        <FieldGroup>
          <Field><FieldLabel htmlFor="home-dose">Dose — units</FieldLabel><Input id="home-dose" name="dose_units" type="number" inputMode="decimal" min="0.001" max="99999.999" step="0.001" required defaultValue={editing?.dose_units ?? ""} disabled={busy || locked} /></Field>
          <Field><FieldLabel htmlFor="home-insulin-name">Insulin name — optional</FieldLabel><Input id="home-insulin-name" name="insulin_name" maxLength={100} defaultValue={editing?.insulin_name ?? ""} disabled={busy || locked} /></Field>
          <Field><FieldLabel htmlFor="home-injected-at">Injection time</FieldLabel><Input id="home-injected-at" name="injected_at" type="datetime-local" step="60" required defaultValue={toLocalDateTime(editing?.injected_at ?? new Date().toISOString())} disabled={busy || locked} /></Field>
          <Field><FieldLabel htmlFor="home-linked-meal">Link to a meal — optional</FieldLabel><select id="home-linked-meal" name="meal_id" defaultValue={editing?.meal_id ?? ""} disabled={busy || locked || loading} className="min-h-11 rounded-lg border bg-background px-3">
            <option value="">No meal link</option>
            {editing?.meal_id && !meals.some((meal) => meal.id === editing.meal_id) && <option value={editing.meal_id}>Previously linked meal</option>}
            {meals.map((meal) => <option key={meal.id} value={meal.id}>{meal.name} · {new Date(meal.eaten_at).toLocaleDateString()}</option>)}
          </select></Field>
          <Field><FieldLabel htmlFor="home-insulin-notes">Notes — optional</FieldLabel><Input id="home-insulin-notes" name="notes" maxLength={2000} defaultValue={editing?.notes ?? ""} disabled={busy || locked} /></Field>
        </FieldGroup>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {editing && <Button variant="ghost" disabled={busy || locked} onClick={() => select(null)}>Cancel editing</Button>}
      <section aria-label="Recent insulin entries" className="space-y-2 border-t pt-4">
        <h2 className="font-medium">Recent entries</h2>
        {loading && <p role="status" className="text-sm">Loading entries…</p>}
        {loadError && <><p role="alert" className="text-sm">{loadError}</p><Button variant="outline" onClick={() => setRevision((n) => n + 1)}>Reload records</Button></>}
        {!loading && !loadError && !entries.length && <p className="text-sm text-muted-foreground">No insulin entries yet.</p>}
        {entries.map((entry) => <button key={entry.id} type="button" disabled={busy || locked} className="block min-h-16 w-full rounded-xl border p-3 text-left disabled:opacity-50" onClick={() => select(entry)}><span className="block font-medium">{entry.dose_units} units · {entry.insulin_name ?? "Insulin"}</span><span className="text-xs text-muted-foreground">{new Date(entry.injected_at).toLocaleString()} · Edit entry</span></button>)}
      </section>
    </div>
    <div className={styles.actions}><Button form="home-insulin" type="submit" disabled={busy || loading} className="min-h-12 w-full">{busy ? "Saving…" : locked ? "Retry save" : editing ? "Save changes" : "Save insulin entry"}</Button></div>
  </>;
}
