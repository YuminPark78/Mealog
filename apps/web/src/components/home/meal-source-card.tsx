import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./home-workflow.module.css";
import { HomeCardHeader } from "./home-card-header";
import { MealPhotoPanel } from "./meal-photo-panel";

type Props = { preview: string; busy: boolean; onPhoto: (file: File) => void; onManual: () => void };

export function MealSourceCard(p: Props) {
  return <>
    <HomeCardHeader eyebrow="A moment before your meal" title="Log a meal" description="Start with a photo, or enter your meal yourself." />
    <div className={`${styles.body} space-y-5`}>
      <MealPhotoPanel preview={p.preview} disabled={p.busy} onPhoto={p.onPhoto} />
      <Button variant="outline" className="min-h-12 w-full" disabled={p.busy} onClick={p.onManual}><PenLine aria-hidden="true" />Enter manually</Button>
      <p className="text-xs text-muted-foreground">Photos are sent to OpenAI for an editable meal estimate. Review the details before saving.</p>
      {p.busy && <p role="status" className="text-sm">Preparing your photo…</p>}
    </div>
  </>;
}
