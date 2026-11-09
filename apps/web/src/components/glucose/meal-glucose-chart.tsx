"use client";

import { useState } from "react";
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

import { apiRequest } from "@/lib/api";
import { ACTIVITY_OPTIONS, type ActivityLevel } from "@/lib/meals";

type Snapshot = {
    window: {
        meal_time: string;
        status: string;
        last_error: string | null;
    };
    readings: {
        measured_at: string;
        glucose_mg_dl: number;
        conflict_detected: boolean;
    }[];
    meals: {
        id: string;
        name: string;
        eaten_at: string;
    }[];
    injections: {
        id: string;
        dose_units: string;
        injected_at: string;
    }[];
    activities: { id: string; name: string; activity_after: ActivityLevel; activity_at: string }[];
    notes: { id: string; name: string; notes: string; notes_at: string }[];
};

type Props = {
    mealId: string;
    accessToken: string;
};

export default function MealGlucoseChart({
    mealId,
    accessToken,
}: Props) {
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function load() {
        setBusy(true);
        setError("");

        try {
            const result = await apiRequest<Snapshot>(
                `/meals/${mealId}/glucose`,
                accessToken,
            );
            setSnapshot(result);
        } catch (error) {
            setError(
                error instanceof Error ? error.message : "Loading failed.",
            );
        } finally {
            setBusy(false);
        }
    }

    const mealTime = snapshot
        ? Date.parse(snapshot.window.meal_time)
        : 0;

    function relativeMinutes(timestamp: string) {
        return (Date.parse(timestamp) - mealTime) / 60000;
    }

    const activityLabel = (value: ActivityLevel) =>
        ACTIVITY_OPTIONS.find((option) => option.value === value)?.label ?? value;
    const events = snapshot ? [
        ...snapshot.meals.map((meal) => ({ key: `meal-${meal.id}`, time: meal.eaten_at, label: `Meal: ${meal.name}` })),
        ...snapshot.injections.map((event) => ({ key: `insulin-${event.id}`, time: event.injected_at, label: `Insulin: ${event.dose_units} units` })),
        ...snapshot.activities.map((event) => ({ key: `activity-${event.id}`, time: event.activity_at, label: `Activity: ${activityLabel(event.activity_after)} (${event.name})` })),
        ...snapshot.notes.map((event) => ({ key: `note-${event.id}`, time: event.notes_at, label: `Note: ${event.notes} (${event.name})` })),
    ].sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.key.localeCompare(b.key)) : [];

    const points: { minute: number; glucose: number | null }[] = [];

    if (snapshot) {
        for (const reading of snapshot.readings) {
            const minute = relativeMinutes(reading.measured_at);
            const previous = points.at(-1);

            if (previous && minute - previous.minute > 10) {
                points.push({
                    minute: (previous.minute + minute) / 2,
                    glucose: null,
                });
            }

            points.push({
                minute,
                glucose: reading.conflict_detected
                    ? null
                    : reading.glucose_mg_dl,
            });
        }
    }

    // Recharts needs an X domain even before any glucose samples arrive.
    // Null endpoints create axes for event markers without inventing readings.
    if (points.length === 0) {
        points.push({ minute: -120, glucose: null }, { minute: 120, glucose: null });
    }
    const hasGlucose = points.some((point) => point.glucose !== null);

    return (
        <section className="mt-3 space-y-3 rounded border p-3">
            <button
                type="button"
                onClick={load}
                disabled={busy}
                className="rounded border px-3 py-2"
            >
                {busy
                    ? "Loading…"
                    : snapshot
                        ? "Refresh timeline"
                        : "Load meal timeline"}
            </button>

            {error && <p role="alert">{error}</p>}

            {snapshot && (
                <>
                    <p>Status: {snapshot.window.status}</p>

                    {snapshot.window.status === "awaiting_connection" && (
                        <p>Connect Dexcom using the local setup script.</p>
                    )}

                    {snapshot.readings.length === 0 ? (
                        <p>No readings collected for this window yet.</p>
                    ) : null}
                        <div style={{ width: "100%", height: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={points} margin={{ top: 12, right: 16, bottom: 24, left: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="minute"
                                        type="number"
                                        allowDataOverflow
                                        domain={[-120, 120]}
                                        ticks={[-120, -60, 0, 60, 120]}
                                        label={{
                                            value: "Minutes relative to eating",
                                            position: "insideBottom",
                                            offset: -15,
                                        }}
                                    />
                                    <YAxis
                                        hide={!hasGlucose}
                                        allowDataOverflow={!hasGlucose}
                                        domain={hasGlucose ? [0, "auto"] : [0, 1]}
                                        label={{
                                            value: "mg/dL",
                                            angle: -90,
                                            position: "insideLeft",
                                        }}
                                    />
                                    <Tooltip />
                                    <Line
                                        type="linear"
                                        dataKey="glucose"
                                        stroke="#2563eb"
                                        dot={false}
                                        connectNulls={false}
                                        isAnimationActive={false}
                                    />

                                    {snapshot.meals.map((meal) => (
                                        <ReferenceLine
                                            key={meal.id}
                                            x={relativeMinutes(meal.eaten_at)}
                                            stroke="#64748b"
                                        />
                                    ))}

                                    {snapshot.injections.map((event) => (
                                        <ReferenceLine
                                            key={event.id}
                                            x={relativeMinutes(event.injected_at)}
                                            stroke="#9333ea"
                                            strokeDasharray="4 4"
                                        />
                                    ))}
                                    {snapshot.activities.map((event) => (
                                        <ReferenceLine key={`activity-${event.id}`}
                                            x={relativeMinutes(event.activity_at)} stroke="#15803d"
                                            strokeDasharray="2 2" />
                                    ))}
                                    {snapshot.notes.map((event) => (
                                        <ReferenceLine key={`note-${event.id}`}
                                            x={relativeMinutes(event.notes_at)} stroke="#b45309"
                                            strokeDasharray="2 4" />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                    <p className="text-sm">Blue: glucose · Gray: meals · Purple: insulin · Green: activity · Amber: notes</p>
                    <ol aria-label="Timeline events" className="space-y-2 text-sm">
                        {events.map((event) => (
                            <li key={event.key}>
                                <time dateTime={event.time}>{new Date(event.time).toLocaleString()}</time>
                                {" — "}{event.label}
                            </li>
                        ))}
                    </ol>
                    <p className="text-sm">Times use your device&apos;s timezone. Details without a recorded occurrence time are omitted.</p>

                    <p className="text-sm">
                        Historical readings. Gaps and conflicting readings are
                        not joined into a continuous curve.
                    </p>
                </>
            )}
        </section>
    );
}
