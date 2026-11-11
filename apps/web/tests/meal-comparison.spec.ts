import { expect, test } from "@playwright/test";

import { curvePoints } from "../src/lib/meal-comparison";
import type { Snapshot } from "../src/components/glucose/meal-glucose-chart";


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