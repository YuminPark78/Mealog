import { expect, test } from "@playwright/test";

import { curvePoints, glucoseAtMinute } from "../src/lib/meal-comparison";
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

test("shared axes include post-meal readings for both current and historical meals", () => {
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
    const current = snapshot([[-65, 999], [-60, 90], [0, 110], [60, 310], [120, 150], [125, 999], [90, 999, true]]);
    expect(comparisonDomain(history, current)).toEqual([60, 340]);
    expect(comparisonDomain(null, current)).toEqual([60, 340]);
    expect(comparisonDomain(null, snapshot([[-60, 90], [0, 110]]))).toEqual([60, 140]);
    expect(comparisonDomain(null, snapshot([]))).toEqual([60, 200]);
});


test("insulin aligns to its own curve at the exact injection time", () => {
    const current = [{ minute: -5, glucose: 100 }, { minute: 0, glucose: 120 }];
    const historical = [{ minute: -5, glucose: 200 }, { minute: 0, glucose: 180 }];
    expect(glucoseAtMinute(current, -5)).toBe(100);
    expect(glucoseAtMinute(current, -2)).toBe(112);
    expect(glucoseAtMinute(historical, -2)).toBe(188);
    expect(glucoseAtMinute(current, 0)).toBe(120);
    expect(glucoseAtMinute(current, -6)).toBeNull();
    expect(glucoseAtMinute(current, 1)).toBeNull();
    expect(glucoseAtMinute([], 0)).toBeNull();
});

test("insulin markers do not bridge gaps or conflicting readings", () => {
    const points = [
        { minute: 0, glucose: 100 },
        { minute: 5, glucose: null },
        { minute: 10, glucose: 120 },
        { minute: 20, glucose: null },
        { minute: 30, glucose: 140 },
    ];
    for (const minute of [2, 5, 7, 15, 20, 25]) {
        expect(glucoseAtMinute(points, minute)).toBeNull();
    }
    expect(glucoseAtMinute(points, 10)).toBe(120);
});
