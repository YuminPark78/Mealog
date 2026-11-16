import type { Meal } from "@/lib/meals";
import type { SimilarMealsResponse } from "@/lib/meal-comparison";
import type { Snapshot } from "@/components/glucose/meal-glucose-chart";

export type PhotoDraft = {
  status: "estimated" | "needs_context" | "not_food";
  name: string | null;
  carbohydrates_g: number | null;
  foods: string[];
  assumptions: string[];
  message: string;
};

export type MealDraft = { name: string; carbs: string; eatenAt: string; picturedCarbs: number | null; share: string };
export type Step = "source" | "review" | "compare" | "follow-up";
export type Workflow = {
  step: Step;
  direction: "forward" | "backward";
  draft: MealDraft;
  saved: Meal | null;
  history: SimilarMealsResponse | null;
  selectedMatch: string | null;
};
export const emptyDraft: MealDraft = { name: "", carbs: "", eatenAt: "", picturedCarbs: null, share: "1" };
export const initialWorkflow: Workflow = { step: "source", direction: "forward", draft: emptyDraft, saved: null, history: null, selectedMatch: null };
export type WorkflowAction =
  | { type: "go"; step: Step; direction?: Workflow["direction"] }
  | { type: "draft"; changes: Partial<MealDraft> }
  | { type: "saved"; meal: Meal }
  | { type: "updated"; meal: Meal }
  | { type: "history"; history: SimilarMealsResponse }
  | { type: "select-match"; id: string }
  | { type: "new" };

export function workflowReducer(state: Workflow, action: WorkflowAction): Workflow {
  switch (action.type) {
    case "go": return { ...state, step: action.step, direction: action.direction ?? "forward" };
    case "draft": return { ...state, draft: { ...state.draft, ...action.changes } };
    case "saved": return { ...state, saved: action.meal, history: null, selectedMatch: null, step: "compare", direction: "forward" };
    case "updated": return { ...state, saved: action.meal, history: null };
    case "history": return { ...state, history: action.history };
    case "select-match": return state.selectedMatch === action.id ? state : { ...state, selectedMatch: action.id };
    case "new": return { ...initialWorkflow, draft: { ...emptyDraft }, direction: "backward" };
  }
}

export function comparisonDomain(history: SimilarMealsResponse | null, current: Snapshot | null = null): [number, number] {
  const values = [...(history?.matches.map(({ snapshot }) => ({ snapshot, end: 120 })) ?? []), ...(current ? [{ snapshot: current, end: 0 }] : [])].flatMap(({ snapshot, end }) => snapshot.readings
    .filter((r) => !r.conflict_detected && (Date.parse(r.measured_at) - Date.parse(snapshot.window.meal_time)) / 60000 >= -60
      && (Date.parse(r.measured_at) - Date.parse(snapshot.window.meal_time)) / 60000 <= end)
    .map((r) => r.glucose_mg_dl));
  if (!values.length) return [60, 200];
  return [Math.max(0, Math.floor((Math.min(...values) - 20) / 20) * 20), Math.ceil((Math.max(...values) + 20) / 20) * 20];
}
