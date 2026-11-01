import { expect, test } from "@playwright/test";

import { getMealContextChanges, type MealContext } from "../src/lib/meals";

const empty: MealContext = {
    activity_after: null,
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
        fraction_consumed: 0.75,
        notes: "Left some rice",
    };
    expect(getMealContextChanges(saved, saved)).toEqual({});
});

test("clearing previously saved fields remains an explicit update", () => {
    const saved: MealContext = {
        activity_after: "light_activity",
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
    expect(getMealContextChanges(original, { ...original, notes: "  A walk later  " }))
        .toEqual({ notes: "A walk later" });
});
