export type ActivityLevel =
    | "mostly_sitting"
    | "light_activity"
    | "intense_exercise"
    | "other_mixed";

export const ACTIVITY_OPTIONS: {
    value: ActivityLevel;
    label: string;
}[] = [
        { value: "mostly_sitting", label: "Mostly sitting" },
        { value: "light_activity", label: "Walking / light activity" },
        { value: "intense_exercise", label: "Intense workout" },
        { value: "other_mixed", label: "Other / mixed" },
    ];

export type Meal = {
    id: string;
    user_id: string;
    name: string;
    carbohydrates_g: number | null;
    eaten_at: string;
    notes: string | null;
    created_at: string;
    activity_after: ActivityLevel | null;
    fraction_consumed: number | null;
    context_updated_at: string | null;
};

export type MealContext = Pick<
    Meal,
    "activity_after" | "fraction_consumed" | "notes"
>;

export function getMealContextChanges(
    original: MealContext,
    next: MealContext,
): Partial<MealContext> {
    const changes: Partial<MealContext> = {};

    if (next.activity_after !== original.activity_after) {
        changes.activity_after = next.activity_after;
    }
    if (next.fraction_consumed !== original.fraction_consumed) {
        changes.fraction_consumed = next.fraction_consumed;
    }

    const notes = next.notes?.trim() || null;
    const previousNotes = original.notes?.trim() || null;
    if (notes !== previousNotes) {
        changes.notes = notes;
    }

    return changes;
}
