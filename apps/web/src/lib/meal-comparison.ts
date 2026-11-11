import type { Meal } from "@/lib/meals";
import type { Snapshot } from "@/components/glucose/meal-glucose-chart";


export type SimilarMeal = {
    meal: Meal;
    exact_name: boolean;
    similarity: number;

    consumed_carbohydrates_g: number;
    carbohydrate_difference_g: number;

    snapshot: Snapshot;
};

export type SimilarMealsResponse = {
    basis: "planned_serving" | "consumed";
    reference_carbohydrates_g: number | null;
    tolerance_g: number | null;
    message: string;
    matches: SimilarMeal[];
};

export type CurvePoint = {
    minute: number;
    glucose: number | null;
};


export function curvePoints(snapshot: Snapshot): CurvePoint[] {
    const mealTime = Date.parse(snapshot.window.meal_time);
    const readings = [...snapshot.readings].sort(
        (a, b) =>
            Date.parse(a.measured_at) - Date.parse(b.measured_at),
    );

    const points: CurvePoint[] = [];
    let previousMinute: number | null = null;

    for (const reading of readings) {
        const minute =
            (Date.parse(reading.measured_at) - mealTime) / 60000;

        if (
            previousMinute !== null
            && minute - previousMinute > 10
        ) {
            points.push({
                minute: (previousMinute + minute) / 2,
                glucose: null,
            });
        }

        points.push({
            minute,
            glucose: reading.conflict_detected
                ? null
                : reading.glucose_mg_dl,
        });

        previousMinute = minute;
    }

    return points;
}