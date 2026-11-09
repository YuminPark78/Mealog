"use client";

import { useEffect, useState, type FormEvent } from "react";

import { apiRequest } from "@/lib/api";
import { fromLocalDateTime, toLocalDateTime } from "@/lib/datetime";
import type { Meal } from "@/lib/meals";

type InsulinEvent = {
    id: string;
    user_id: string;
    meal_id: string | null;
    dose_units: string;
    insulin_name: string | null;
    injected_at: string;
    notes: string | null;
    created_at: string;
};

type Props = {
    accessToken: string;
    meals: Meal[];
    onSaved: () => void;
};

export default function InsulinEventsPanel({
    accessToken,
    meals,
    onSaved,
}: Props) {
    const [events, setEvents] = useState<InsulinEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [editing, setEditing] = useState<InsulinEvent | null>(null);
    const [formVersion, setFormVersion] = useState(0);

    useEffect(() => {
        let active = true;

        apiRequest<InsulinEvent[]>("/insulin-events", accessToken)
            .then((rows) => {
                if (active) setEvents(rows);
            })
            .catch((error: unknown) => {
                if (active) {
                    setMessage(
                        error instanceof Error ? error.message : "Loading failed.",
                    );
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [accessToken]);

    async function saveEvent(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const form = event.currentTarget;
        const values = new FormData(form);

        const mealId = String(values.get("meal_id"));
        const insulinName = String(values.get("insulin_name")).trim();
        const notes = String(values.get("notes")).trim();

        setBusy(true);
        setMessage("");

        try {
            const saved = await apiRequest<InsulinEvent>(
                editing ? `/insulin-events/${editing.id}` : "/insulin-events",
                accessToken,
                {
                    method: editing ? "PUT" : "POST",
                    body: JSON.stringify({
                        meal_id: mealId === "" ? null : mealId,
                        dose_units: String(values.get("dose_units")),
                        insulin_name: insulinName || null,
                        injected_at: fromLocalDateTime(
                            String(values.get("injected_at")),
                            editing?.injected_at ?? null,
                        ),
                        notes: notes || null,
                    }),
                },
            );

            setEvents((current) =>
                [saved, ...current.filter((row) => row.id !== saved.id)]
                    .sort(
                        (a, b) =>
                            Date.parse(b.injected_at) - Date.parse(a.injected_at),
                    )
                    .slice(0, 50),
            );

            setEditing(null);
            setFormVersion((version) => version + 1);
            onSaved();
            setMessage(editing ? "Insulin event updated." : "Insulin event saved.");
        } catch (error) {
            setMessage(
                error instanceof Error ? error.message : "Saving failed.",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="space-y-4 rounded border p-4">
            <h2 className="text-xl font-semibold">Insulin events</h2>
            <p>Record insulin already administered.</p>

            {editing && <p>Editing the event from {new Date(editing.injected_at).toLocaleString()}.</p>}
            <form key={`${editing?.id ?? "new"}-${formVersion}`} onSubmit={saveEvent}>
                <fieldset disabled={busy || loading} className="space-y-3">
                    <label className="block">
                        Actual dose — units
                        <input
                            name="dose_units"
                            defaultValue={editing?.dose_units ?? ""}
                            type="number"
                            min="0.001"
                            max="99999.999"
                            step="0.001"
                            required
                            className="block w-full rounded border p-2"
                        />
                    </label>

                    <label className="block">
                        Administration time — your device&apos;s timezone
                        <input
                            name="injected_at"
                            defaultValue={toLocalDateTime(editing?.injected_at ?? null)}
                            type="datetime-local"
                            step="0.001"
                            required
                            className="block w-full rounded border p-2"
                        />
                    </label>

                    <label className="block">
                        Insulin name — optional
                        <input
                            name="insulin_name"
                            defaultValue={editing?.insulin_name ?? ""}
                            maxLength={100}
                            className="block w-full rounded border p-2"
                        />
                    </label>

                    <label className="block">
                        Related meal — optional
                        <select
                            name="meal_id"
                            defaultValue={editing?.meal_id ?? ""}
                            className="block w-full rounded border p-2"
                        >
                            <option value="">Not linked to a meal</option>
                            {editing?.meal_id && !meals.some((meal) => meal.id === editing.meal_id) && (
                                <option value={editing.meal_id}>Previously linked meal</option>
                            )}
                            {meals.map((meal) => (
                                <option key={meal.id} value={meal.id}>
                                    {meal.name} — {new Date(meal.eaten_at).toLocaleString()}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        Notes — optional
                        <textarea
                            name="notes"
                            defaultValue={editing?.notes ?? ""}
                            maxLength={2000}
                            className="block w-full rounded border p-2"
                        />
                    </label>

                    <button type="submit" className="rounded border px-4 py-2">
                        {busy ? "Saving…" : editing ? "Save changes" : "Save insulin event"}
                    </button>
                    {editing && <button type="button" className="ml-3 underline"
                        onClick={() => { setEditing(null); setMessage(""); }}>Cancel edit</button>}
                </fieldset>
            </form>

            <p role="status">{message}</p>

            {loading ? (
                <p>Loading insulin events…</p>
            ) : events.length === 0 ? (
                <p>No insulin events recorded.</p>
            ) : (
                <ul className="space-y-3">
                    {events.map((event) => {
                        const meal = meals.find(
                            (candidate) => candidate.id === event.meal_id,
                        );

                        return (
                            <li key={event.id} className="rounded border p-3">
                                <strong>{event.dose_units} units</strong>
                                <p>{event.insulin_name ?? "Insulin name not recorded"}</p>
                                <p>{new Date(event.injected_at).toLocaleString()}</p>
                                <p>
                                    {event.meal_id
                                        ? `Meal: ${meal?.name ?? "Linked meal"}`
                                        : "Not linked to a meal"}
                                </p>
                                {event.notes && <p>{event.notes}</p>}
                                <button type="button" disabled={busy} className="underline"
                                    onClick={() => { setEditing(event); setMessage(""); }}>
                                    Edit event
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
