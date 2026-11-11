"use client";

import { useEffect, useState } from "react";
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    XAxis,
    YAxis,
} from "recharts";

import { apiRequest } from "@/lib/api";
import type { Meal } from "@/lib/meals";
import {
    curvePoints,
    type SimilarMealsResponse,
} from "@/lib/meal-comparison";

import MealGlucoseChart, {
    type Snapshot,
} from "@/components/glucose/meal-glucose-chart";


type Props = {
    meal: Meal;
    accessToken: string;
    revision: number;
    autoOpen?: boolean;
};

const COLORS = ["#111827", "#2563eb", "#9333ea", "#15803d"];
const DASHES = [undefined, "8 4", "3 3", "12 3 2 3"];

function messageFor(error: unknown): string {
    return error instanceof Error ? error.message : "Loading failed.";
}

function grams(value: number): string {
    return `${Math.round(value * 10) / 10} g`;
}


export default function MealComparisonPanel({
    meal,
    accessToken,
    revision,
    autoOpen = false,
}: Props) {
    const [open, setOpen] = useState(autoOpen);
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [history, setHistory] = useState<SimilarMealsResponse | null>(null);

    const [currentLoading, setCurrentLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [currentError, setCurrentError] = useState("");
    const [historyError, setHistoryError] = useState("");

    const [currentRefresh, setCurrentRefresh] = useState(0);
    const [historyRefresh, setHistoryRefresh] = useState(0);

    const [hiddenIds, setHiddenIds] = useState<string[]>([]);
    const [fullWindow, setFullWindow] = useState(false);

    const mealId = meal.id;

    // Relevant edits deliberately invalidate matches.
    // Insulin/activity changes only refresh the current snapshot.
    const matchingSignature = JSON.stringify([
        meal.name,
        meal.carbohydrates_g,
        meal.fraction_consumed,
    ]);

    useEffect(() => {
        if (!open) return;

        let active = true;
        const controller = new AbortController();

        async function loadCurrent() {
            setCurrentLoading(true);
            setCurrentError("");

            try {
                const result = await apiRequest<Snapshot>(
                    `/meals/${mealId}/glucose`,
                    accessToken,
                    {
                        signal: AbortSignal.any([
                            controller.signal,
                            AbortSignal.timeout(15_000),
                        ]),
                    },
                );

                if (active) setSnapshot(result);
            } catch (error) {
                if (active) setCurrentError(messageFor(error));
            } finally {
                if (active) setCurrentLoading(false);
            }
        }

        void loadCurrent();

        return () => {
            active = false;
            controller.abort();
        };
    }, [open, mealId, accessToken, revision, currentRefresh]);

    useEffect(() => {
        if (!open) return;

        let active = true;
        const controller = new AbortController();

        async function loadHistory() {
            setHistoryLoading(true);
            setHistoryError("");
            setHistory(null);

            try {
                const result = await apiRequest<SimilarMealsResponse>(
                    `/meals/${mealId}/similar`,
                    accessToken,
                    {
                        method: "POST",
                        signal: AbortSignal.any([
                            controller.signal,
                            AbortSignal.timeout(100_000),
                        ]),
                    },
                );

                if (active) {
                    setHistory(result);
                    setHiddenIds([]);
                }
            } catch (error) {
                if (active) setHistoryError(messageFor(error));
            } finally {
                if (active) setHistoryLoading(false);
            }
        }

        void loadHistory();

        return () => {
            active = false;
            controller.abort();
        };
    }, [
        open,
        mealId,
        accessToken,
        matchingSignature,
        historyRefresh,
    ]);

    if (!open) {
        return (
            <button
                type="button"
                className="mt-3 rounded border px-3 py-2"
                onClick={() => setOpen(true)}
            >
                View glucose comparison
            </button>
        );
    }

    const series = [
        ...(snapshot ? [{
            id: "current",
            label: "This meal",
            snapshot,
            color: COLORS[0],
            dash: DASHES[0],
        }] : []),

        ...(history?.matches.map((match, index) => ({
            id: match.meal.id,
            label: `${match.meal.name} — ${new Date(match.meal.eaten_at).toLocaleString()
                } — ${grams(match.consumed_carbohydrates_g)} consumed`,
            snapshot: match.snapshot,
            color: COLORS[index + 1],
            dash: DASHES[index + 1],
        })) ?? []),
    ].map((series) => ({
        ...series,
        points: curvePoints(series.snapshot),
    }));

    const visible = series.filter(
        (series) => !hiddenIds.includes(series.id),
    );

    const hasValues = visible.some(
        (series) => series.points.some(
            (point) => point.glucose !== null,
        ),
    );

    return (
        <section
            className="mt-3 space-y-4 rounded border p-3"
            aria-label="Historical glucose comparison"
        >
            <h3 className="font-semibold">Past meals with similar dishes and carbs</h3>

            <p className="text-sm">
                Each curve is aligned to its own eating time.
                Historical curves show past observations, not a prediction.
            </p>

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    disabled={currentLoading}
                    onClick={() => setCurrentRefresh((value) => value + 1)}
                    className="rounded border px-3 py-2"
                >
                    {currentLoading ? "Refreshing…" : "Refresh current glucose"}
                </button>

                <button
                    type="button"
                    disabled={historyLoading}
                    onClick={() => setHistoryRefresh((value) => value + 1)}
                    className="rounded border px-3 py-2"
                >
                    {historyLoading ? "Finding matches…" : "Find matches again"}
                </button>
            </div>

            {currentError && <p role="alert">{currentError}</p>}
            {historyError && <p role="alert">{historyError}</p>}

            {snapshot && <p>Current collection: {snapshot.window.status}</p>}

            {historyLoading && (
                <p role="status">
                    Finding historical meals. The first search may take longer
                    while dish-name embeddings are prepared.
                </p>
            )}

            {history && (
                <>
                    <p>{history.message}</p>

                    {history.reference_carbohydrates_g !== null && (
                        <p>
                            Matching against{" "}
                            {grams(history.reference_carbohydrates_g)}
                            {" "}
                            {history.basis === "consumed"
                                ? "estimated consumed carbohydrates"
                                : "planned personal-serving carbohydrates"}.
                        </p>
                    )}
                </>
            )}

            <fieldset className="space-y-2">
                <legend>Visible curves</legend>

                {series.map((series) => (
                    <label key={series.id} className="block">
                        <input
                            type="checkbox"
                            checked={!hiddenIds.includes(series.id)}
                            onChange={(event) => {
                                setHiddenIds((current) =>
                                    event.target.checked
                                        ? current.filter((id) => id !== series.id)
                                        : [...current, series.id],
                                );
                            }}
                        />
                        {" "}
                        <span style={{ color: series.color }}>
                            {series.label}
                        </span>
                    </label>
                ))}
            </fieldset>

            <label className="block text-sm">
                <input
                    type="checkbox"
                    checked={fullWindow}
                    onChange={(event) => setFullWindow(event.target.checked)}
                />
                {" "}Show the full two-hour pre-meal window
            </label>

            <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={[{ minute: -120 }, { minute: 120 }]}
                        margin={{ top: 12, right: 16, bottom: 24, left: 8 }}
                        accessibilityLayer
                    >
                        <CartesianGrid strokeDasharray="3 3" />

                        <XAxis
                            dataKey="minute"
                            type="number"
                            domain={[fullWindow ? -120 : -30, 120]}
                            allowDataOverflow
                            ticks={
                                fullWindow
                                    ? [-120, -60, 0, 60, 120]
                                    : [-30, 0, 30, 60, 90, 120]
                            }
                            label={{
                                value: "Minutes relative to eating",
                                position: "insideBottom",
                                offset: -15,
                            }}
                        />

                        <YAxis
                            type="number"
                            hide={!hasValues}
                            allowDataOverflow={!hasValues}
                            domain={hasValues ? [0, "auto"] : [0, 1]}
                            label={{
                                value: "mg/dL",
                                angle: -90,
                                position: "insideLeft",
                            }}
                        />

                        <ReferenceLine
                            x={0}
                            stroke="#64748b"
                            strokeDasharray="4 4"
                        />

                        {visible.map((series) => (
                            <Line
                                key={series.id}
                                data={series.points}
                                dataKey="glucose"
                                name={series.label}
                                type="linear"
                                stroke={series.color}
                                strokeDasharray={series.dash}
                                strokeWidth={series.id === "current" ? 3 : 2}
                                connectNulls={false}
                                dot={false}
                                isAnimationActive={false}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {!hasValues && (
                <p>No usable glucose readings are available for the visible curves yet.</p>
            )}

            {history?.matches.map((match) => (
                <div key={match.meal.id} className="rounded border p-3 text-sm">
                    <strong>{match.meal.name}</strong>

                    <p>
                        {match.exact_name ? "Same dish name" : "Similar dish name"}
                        {" · "}
                        {grams(match.carbohydrate_difference_g)} carbohydrate difference
                        {" · "}
                        {match.snapshot.window.status} glucose window
                    </p>

                    <p>
                        Full serving:{" "}
                        {match.meal.carbohydrates_g === null
                            ? "Unknown"
                            : grams(match.meal.carbohydrates_g)}
                        {" · "}Consumed: {grams(match.consumed_carbohydrates_g)}
                    </p>

                    <details>
                        <summary>Recorded context</summary>

                        <p>
                            Activity: {match.meal.activity_after ?? "Not recorded"}
                        </p>

                        <p>Notes: {match.meal.notes ?? "Not recorded"}</p>

                        {match.snapshot.injections.map((event) => (
                            <p key={event.id}>
                                Recorded insulin: {event.dose_units} units at{" "}
                                {new Date(event.injected_at).toLocaleString()}
                            </p>
                        ))}
                    </details>
                </div>
            ))}

            <details>
                <summary>Actual readings for visible curves</summary>

                {visible.map((series) => (
                    <div key={series.id} className="mt-3">
                        <strong>{series.label}</strong>

                        <table>
                            <thead>
                                <tr>
                                    <th scope="col">Minutes from eating</th>
                                    <th scope="col">Glucose, mg/dL</th>
                                </tr>
                            </thead>

                            <tbody>
                                {series.points.map((point, index) => (
                                    <tr key={index}>
                                        <td>{point.minute.toFixed(1)}</td>
                                        <td>{point.glucose ?? "Gap / excluded"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </details>

            <details>
                <summary>Current meal timeline and recorded context</summary>

                <MealGlucoseChart
                    key={`${mealId}-${revision}`}
                    mealId={mealId}
                    accessToken={accessToken}
                />
            </details>
        </section>
    );
}