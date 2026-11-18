import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { MealDraft, PhotoDraft } from "@/lib/meal-workflow";
import styles from "./home-workflow.module.css";
import { HomeCardHeader } from "./home-card-header";
import { MealPhotoPanel } from "./meal-photo-panel";

type Props = {
  draft: MealDraft; estimate: PhotoDraft | null; analysing: boolean; saving: boolean; locked: boolean;
  onChange: (changes: Partial<MealDraft>) => void; onBack: () => void;
  onSave: () => void; onManual: () => void;
  preview: string; onPhoto: (file: File) => void;
};

export function MealDetailsCard(p: Props) {
  const photo = p.preview && <div className="mb-5"><MealPhotoPanel preview={p.preview} disabled={p.saving || p.locked} onPhoto={p.onPhoto} /></div>;
  return <>
    <HomeCardHeader title="Meal details" description="Review your serving before saving." eyebrow="Review your meal"
      back={p.locked ? undefined : { label: p.analysing ? "Cancel analysis" : "Photo or manual entry", onClick: p.onBack, disabled: p.saving }} />
    {p.analysing ? <div className={`${styles.body} space-y-4`}>{photo}<p role="status">Looking at your meal…</p><p className="text-sm text-muted-foreground">You can enter the details yourself while photo analysis is unavailable.</p><Button variant="outline" onClick={p.onManual}>Enter manually instead</Button></div> : <>
      <div className={styles.body}>
        {photo}
        <form id="meal-review" onSubmit={(event) => { event.preventDefault(); p.onSave(); }}>
          <FieldGroup>
            {p.estimate && <p className="text-xs text-muted-foreground">{p.estimate.status === "not_food" ? "We couldn’t identify a meal. Enter the details below." : "Suggested from your photo. Please review the estimate."}</p>}
            <Field><FieldLabel htmlFor="meal-name">Meal name</FieldLabel><Input id="meal-name" required maxLength={200} value={p.draft.name} disabled={p.saving || p.locked} onChange={(e) => p.onChange({ name: e.target.value })} placeholder="For example: chicken rice" /></Field>
            {p.draft.picturedCarbs !== null && <Field><FieldLabel htmlFor="photo-share">My share of the pictured food</FieldLabel>
              <select id="photo-share" className="min-h-11 rounded-lg border bg-background px-3" value={p.draft.share} disabled={p.saving || p.locked} onChange={(e) => p.onChange({ share: e.target.value, carbs: String(Math.round(p.draft.picturedCarbs! * Number(e.target.value) * 100) / 100) })}>
                <option value="1">All pictured food</option><option value="0.75">Three quarters</option><option value="0.5">Half</option><option value="0.3333333333">One third</option><option value="0.25">One quarter</option>
              </select><p className="text-xs text-muted-foreground">Changing this replaces the carbohydrate estimate below. This is your planned serving, not the amount already eaten.</p></Field>}
            <Field><FieldLabel htmlFor="meal-carbs">Carbohydrates in my serving — grams</FieldLabel><Input id="meal-carbs" type="number" inputMode="decimal" min="0" max="999999.99" step="0.01" value={p.draft.carbs} disabled={p.saving || p.locked} onChange={(e) => p.onChange({ carbs: e.target.value })} placeholder="Optional" />
              {p.draft.carbs === "" && <p className="text-xs text-muted-foreground">You can save without this, but similar-meal comparisons need a carbohydrate amount.</p>}</Field>
            <Field><FieldLabel htmlFor="meal-time">Eating time</FieldLabel><Input id="meal-time" type="datetime-local" step="60" required value={p.draft.eatenAt} disabled={p.saving || p.locked} onChange={(e) => p.onChange({ eatenAt: e.target.value })} /><p className="text-xs text-muted-foreground">Your device’s local time.</p></Field>
            {!!p.estimate?.assumptions.length && <details className="text-xs text-muted-foreground"><summary>About this estimate</summary><ul className="mt-2 list-disc pl-4">{p.estimate.assumptions.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
          </FieldGroup>
        </form>
      </div>
      <div className={styles.actions}><Button type="submit" form="meal-review" disabled={p.saving} className="min-h-12 w-full">{p.saving ? "Saving meal…" : p.locked ? "Retry save & view history" : "Save meal & view history"}</Button></div>
    </>}
  </>;
}
