import { expect, test } from "@playwright/test";

import { getMealContextChanges, type MealContext } from "../src/lib/meals";

const empty: MealContext = {
    activity_after: null,
    activity_at: null,
    notes_at: null,
    fraction_consumed: null,
    notes: null,
};

test("blank and whitespace-only submissions contain no changes", () => {
    expect(getMealContextChanges(empty, empty)).toEqual({});
    expect(getMealContextChanges(empty, { ...empty, notes: "   " })).toEqual({});
});

test("resubmitting saved details contains no changes", () => {
    const saved: MealContext = {
        activity_after: "light_activity",
        activity_at: "2026-11-09T04:00:00Z",
        notes_at: "2026-11-09T04:05:00Z",
        fraction_consumed: 0.75,
        notes: "Left some rice",
    };
    expect(getMealContextChanges(saved, saved)).toEqual({});
});

test("clearing previously saved fields remains an explicit update", () => {
    const saved: MealContext = {
        activity_after: "light_activity",
        activity_at: "2026-11-09T04:00:00Z",
        notes_at: "2026-11-09T04:05:00Z",
        fraction_consumed: 0.75,
        notes: "Left some rice",
    };
    expect(getMealContextChanges(saved, empty)).toEqual(empty);
});

test("zero consumption is a recorded value, not an empty field", () => {
    expect(getMealContextChanges(empty, { ...empty, fraction_consumed: 0 }))
        .toEqual({ fraction_consumed: 0 });
});

test("only changed fields are submitted and notes are trimmed", () => {
    const original = { ...empty, activity_after: "mostly_sitting" as const };
    expect(getMealContextChanges(original, { ...original, notes: "  A walk later  ", notes_at: "2026-11-09T04:00:00Z" }))
        .toEqual({ notes: "A walk later", notes_at: "2026-11-09T04:00:00Z" });
});

test("timestamp corrections submit the value and its occurrence time together", () => {
    const original = { ...empty, activity_after: "light_activity" as const,
        activity_at: "2026-11-09T04:00:00Z" };
    expect(getMealContextChanges(original, { ...original, activity_at: "2026-11-09T04:15:00Z" }))
        .toEqual({ activity_after: "light_activity", activity_at: "2026-11-09T04:15:00Z" });
    expect(getMealContextChanges(original, { ...original, activity_at: "2026-11-09T12:00:00+08:00" }))
        .toEqual({});
});
