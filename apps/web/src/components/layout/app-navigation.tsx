import Link from "next/link";
import styles from "./app-frame.module.css";

type Props = {
  active: "home" | "account";
  onLeave?: () => boolean;
};

export function AppNavigation({ active, onLeave }: Props) {
  return (
    <nav aria-label="Main navigation" className={styles.navigationBar}>
      {(["home", "account"] as const).map((tab) => (
        <Link key={tab} href={`/${tab}`} aria-current={active === tab ? "page" : undefined}
          className={styles.navigationLink}
          onClick={(event) => {
            if (active === tab || (onLeave && !onLeave())) event.preventDefault();
          }}>
          <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">
            {tab === "home" ? "Home" : "Account"}
          </span>
          <span className={`col-start-1 row-start-1 ${active === tab ? "font-semibold" : "text-muted-foreground"}`}>
            {tab === "home" ? "Home" : "Account"}
          </span>
        </Link>
      ))}
    </nav>
  );
}
