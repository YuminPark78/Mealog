import type { Snapshot } from "@/components/glucose/meal-glucose-chart";
import type { SimilarMealsResponse } from "@/lib/meal-comparison";

// Entirely fictional, browser-local examples. Never sent to the meal API.
const mealTime = "2026-11-12T04:30:00Z";
function snapshot(peak: number, shift: number): Snapshot {
  return {
    window: { meal_time: mealTime, status: "complete", last_error: null },
    readings: Array.from({ length: 37 }, (_, index) => {
      const minute = index * 5 - 60;
      return {
        measured_at: new Date(Date.parse(mealTime) + minute * 60_000).toISOString(),
        glucose_mg_dl: Math.round(104 + peak * Math.exp(-((minute - shift) ** 2) / 1600) + 3 * Math.sin(index / 3)),
        conflict_detected: false,
      };
    }),
    meals: [{ id: "demo-meal", name: "Chicken rice", eaten_at: mealTime }],
    injections: [], activities: [], notes: [],
  };
}

export const DEMO_CURRENT = snapshot(48, 47);
export const DEMO_HISTORY: SimilarMealsResponse = {
  basis: "consumed", reference_carbohydrates_g: 60, tolerance_g: 10,
  message: "Illustrative sample meals",
  matches: [
    { label: "A lunchtime walk", peak: 35, shift: 40, activity: "light_activity" as const, note: "A short walk after lunch.", date: "Nov 10" },
    { label: "Back at my desk", peak: 70, shift: 58, activity: "mostly_sitting" as const, note: "An afternoon at my desk.", date: "Nov 8" },
    { label: "A slower afternoon", peak: 54, shift: 65, activity: "other_mixed" as const, note: "A relaxed lunch with friends.", date: "Nov 5" },
  ].map((item, index) => ({
    meal: { id: `demo-history-${index}`, user_id: "demo", name: "Chicken rice", carbohydrates_g: 60, eaten_at: mealTime, created_at: mealTime, activity_after: item.activity, activity_at: null, notes: item.note, notes_at: null, fraction_consumed: 1, context_updated_at: null },
    exact_name: true, similarity: 1, consumed_carbohydrates_g: 60, carbohydrate_difference_g: 0,
    snapshot: snapshot(item.peak, item.shift),
  })),
};
export const DEMO_LABELS = ["A lunchtime walk", "Back at my desk", "A slower afternoon"];
