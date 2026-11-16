import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./home-workflow.module.css";

type Props = {
  title: string;
  description: string;
  eyebrow?: string;
  status?: ReactNode;
  action?: ReactNode;
  back?: { label: string; onClick: () => void; disabled?: boolean };
};

export function HomeCardHeader({ title, description, eyebrow, status, back, action }: Props) {
  return (
    <header className={styles.heading}>
      <div className={styles.headerContext}>
        {back ? (
          <Button variant="ghost" size="sm" disabled={back.disabled}
            className="-ml-2 min-h-11 max-w-full" onClick={back.onClick}>
            <ArrowLeft aria-hidden="true" />
            <span className="truncate">{back.label}</span>
          </Button>
        ) : eyebrow ? (
          <p className="min-w-0 truncate text-xs uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
        ) : <span />}
        {status && <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{status}</span>}
      </div>
      {action ? <div className={styles.headerTitleRow}><h1 tabIndex={-1} className={styles.headerTitle}>{title}</h1>{action}</div>
        : <h1 tabIndex={-1} className={styles.headerTitle}>{title}</h1>}
      <p className={styles.headerDescription} title={description}>{description}</p>
    </header>
  );
}
