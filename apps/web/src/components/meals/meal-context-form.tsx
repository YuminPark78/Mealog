"use client";

import { useState, type FormEvent } from "react";

import { apiRequest } from "@/lib/api";
import { fromLocalDateTime, toLocalDateTime } from "@/lib/datetime";
import {
    ACTIVITY_OPTIONS,
    getMealContextChanges,
    type ActivityLevel,
    type Meal,
} from "@/lib/meals";

type Props = {
    meal: Meal;
    accessToken: string;
    onSaved: (meal: Meal) => void;
};

export default function MealContextForm({
    meal,
    accessToken,
    onSaved,
}: Props) {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [activity, setActivity] = useState(meal.activity_after ?? "");
    const [note, setNote] = useState(meal.notes ?? "");

    async function saveContext(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const values = new FormData(event.currentTarget);

        const after = String(values.get("activity_after"));
        const fraction = String(values.get("fraction_consumed"));
        const notes = String(values.get("notes")).trim();
        const activityTime = String(values.get("activity_at") ?? "");
        const noteTime = String(values.get("notes_at") ?? "");

        if ((after && !activityTime) || (notes && !noteTime)) {
            setMessage("Enter the occurrence time for the activity and note you record.");
            return;
        }

        const changes = getMealContextChanges(meal, {
            activity_after: after === "" ? null : (after as ActivityLevel),
            activity_at: after ? fromLocalDateTime(activityTime, meal.activity_at) : null,
            fraction_consumed: fraction === "" ? null : Number(fraction),
            notes: notes === "" ? null : notes,
            notes_at: notes ? fromLocalDateTime(noteTime, meal.notes_at) : null,
        });

        if (Object.keys(changes).length === 0) {
            setMessage("No changes to save.");
            return;
        }

        setBusy(true);
        setMessage("");

        try {
            const updated = await apiRequest<Meal>(
                `/meals/${meal.id}/context`,
                accessToken,
                {
                    method: "PATCH",
                    body: JSON.stringify(changes),
                },
            );

            onSaved(updated);
            setMessage("Meal details saved.");
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : "Could not save meal details.",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <details className="mt-3 rounded border p-3">
            <summary className="cursor-pointer">
                Add or edit meal details
            </summary>

            <p className="mt-3 text-sm">
                Record when the activity or note applies, using your device&apos;s timezone.
                Older details may need an occurrence time added before saving.
            </p>

            <form onSubmit={saveContext} className="mt-3">
                <fieldset disabled={busy} className="space-y-3">
                    <label className="block">
                        Activity after eating
                        <select
                            name="activity_after"
                            value={activity}
                            onChange={(event) => setActivity(event.target.value)}
                            className="block w-full rounded border p-2"
                        >
                            <option value="">Not recorded</option>
                            {ACTIVITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        Activity time
                        <input name="activity_at" type="datetime-local" step="0.001"
                            required={Boolean(activity)} disabled={!activity}
                            defaultValue={toLocalDateTime(meal.activity_at)}
                            className="block w-full rounded border p-2" />
                    </label>

                    <label className="block">
                        How much of the serving did you eat?
                        <select
                            name="fraction_consumed"
                            defaultValue={
                                meal.fraction_consumed === null
                                    ? ""
                                    : String(meal.fraction_consumed)
                            }
                            className="block w-full rounded border p-2"
                        >
                            <option value="">Not recorded</option>
                            <option value="0">None</option>
                            <option value="0.25">One quarter</option>
                            <option value="0.5">Half</option>
                            <option value="0.75">Three quarters</option>
                            <option value="1">All</option>
                        </select>
                    </label>

                    <label className="block">
                        Notes — optional
                        <textarea
                            name="notes"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            maxLength={2000}
                            rows={3}
                            className="block w-full rounded border p-2"
                        />
                    </label>

                    <label className="block">
                        Note occurrence time
                        <input name="notes_at" type="datetime-local" step="0.001"
                            required={Boolean(note.trim())} disabled={!note.trim()}
                            defaultValue={toLocalDateTime(meal.notes_at)}
                            className="block w-full rounded border p-2" />
                    </label>

                    <button
                        type="submit"
                        className="rounded border px-4 py-2"
                    >
                        {busy ? "Saving…" : "Save details"}
                    </button>
                </fieldset>
            </form>

            <p role="status" className="mt-2">
                {message}
            </p>

            {meal.context_updated_at && (
                <p className="mt-2 text-sm">
                    Last saved:{" "}
                    {new Date(meal.context_updated_at).toLocaleString()}
                </p>
            )}
        </details>
    );
}
