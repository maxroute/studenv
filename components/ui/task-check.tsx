import type { MouseEvent as ReactMouseEvent } from "react";
import { Check } from "lucide-react";
import styles from "./task-check.module.css";

/** The round tick of a planner task, the same on Home and in the Planner. */
export function TaskCheck({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: (event: ReactMouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className={`${styles.check}${checked ? ` ${styles.done}` : ""}`} onClick={onToggle}>
      <span>
        <Check size={12} strokeWidth={3.2} aria-hidden="true" />
      </span>
    </button>
  );
}
