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
                        ? "Refresh stored glucose"
                        : "Load glucose graph"}
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
                    ) : (
                        <div style={{ width: "100%", height: 280 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={points}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="minute"
                                        type="number"
                                        domain={[-120, 120]}
                                        ticks={[-120, -60, 0, 60, 120]}
                                        label={{
                                            value: "Minutes relative to eating",
                                            position: "insideBottom",
                                            offset: -5,
                                        }}
                                    />
                                    <YAxis
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
                                            label={meal.name}
                                        />
                                    ))}

                                    {snapshot.injections.map((event) => (
                                        <ReferenceLine
                                            key={event.id}
                                            x={relativeMinutes(event.injected_at)}
                                            stroke="#9333ea"
                                            strokeDasharray="4 4"
                                            label={`${event.dose_units} U`}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    <p className="text-sm">
                        Historical readings. Gaps and conflicting readings are
                        not joined into a continuous curve.
                    </p>
                </>
            )}
        </section>
    );
}