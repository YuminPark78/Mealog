import Image from "next/image";
import { useRef } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./home-workflow.module.css";

export function MealPhotoPanel({ preview, disabled, onPhoto }: { preview: string; disabled: boolean; onPhoto: (file: File) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  return <div className="space-y-2">
    <div className={styles.photo}>
      {preview ? <Image src={preview} alt="Your selected meal" fill unoptimized sizes="(max-width: 680px) 100vw, 640px" className="object-contain" /> : <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        <Button className="h-auto min-h-16 flex-col gap-2 whitespace-normal px-2 py-3 text-xs sm:text-sm" disabled={disabled} onClick={() => camera.current?.click()}><Camera aria-hidden="true" />Take a photo</Button>
        <Button variant="outline" className="h-auto min-h-16 flex-col gap-2 whitespace-normal px-2 py-3 text-xs sm:text-sm" disabled={disabled} onClick={() => library.current?.click()}><ImagePlus aria-hidden="true" />Choose from photos</Button>
      </div>}
    </div>
    {preview && <Button variant="outline" disabled={disabled} onClick={() => library.current?.click()}>Change photo</Button>}
    <input hidden ref={camera} aria-label="Take meal photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }} />
    <input hidden ref={library} aria-label={preview ? "Change meal photo" : "Choose meal photo"} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }} />
  </div>;
}
