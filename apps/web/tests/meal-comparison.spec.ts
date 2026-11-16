import { expect, test } from "@playwright/test";

import { curvePoints } from "../src/lib/meal-comparison";
import type { Snapshot } from "../src/components/glucose/meal-glucose-chart";
import { comparisonDomain } from "../src/lib/meal-workflow";
import type { SimilarMealsResponse } from "../src/lib/meal-comparison";


test("curves align to eating time and preserve gaps and conflicts", () => {
    const snapshot: Snapshot = {
        window: {
            meal_time: "2026-11-11T04:00:00Z",
            status: "partial",
            last_error: null,
        },
        readings: [
            {
                measured_at: "2026-11-11T03:55:00Z",
                glucose_mg_dl: 100,
                conflict_detected: false,
            },
            {
                measured_at: "2026-11-11T04:00:00Z",
                glucose_mg_dl: 105,
                conflict_detected: true,
            },
            {
                measured_at: "2026-11-11T04:20:00Z",
                glucose_mg_dl: 120,
                conflict_detected: false,
            },
        ],
        meals: [],
        injections: [],
        activities: [],
        notes: [],
    };

    expect(curvePoints(snapshot)).toEqual([
        { minute: -5, glucose: 100 },
        { minute: 0, glucose: null },
        { minute: 10, glucose: null },
        { minute: 20, glucose: 120 },
    ]);
});

test("shared axes include the full historical window but only current pre-meal readings", () => {
    const time = "2026-11-11T04:00:00Z";
    const snapshot = (samples: [number, number, boolean?][]): Snapshot => ({
        window: { meal_time: time, status: "ready", last_error: null },
        readings: samples.map(([minute, value, conflict = false]) => ({
            measured_at: new Date(Date.parse(time) + minute * 60000).toISOString(),
            glucose_mg_dl: value, conflict_detected: conflict,
        })),
        meals: [], injections: [], activities: [], notes: [],
    });
    const history = { matches: [{ snapshot: snapshot([[-90, 999], [-60, 210], [-45, 100], [120, 130], [125, 999], [0, 999, true]]) }] } as SimilarMealsResponse;
    const current = snapshot([[-60, 90], [0, 110], [15, 999]]);
    expect(comparisonDomain(history, current)).toEqual([60, 240]);
    expect(comparisonDomain(null, snapshot([]))).toEqual([60, 200]);
});
