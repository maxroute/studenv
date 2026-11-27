"use client";

import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { usePopup } from "@/components/shell/use-popup";
import styles from "./filter-popover.module.css";

/** One filter button that holds a screen's filters; the number shows how many are on. */
export function FilterPopover({ active, onClear, children }: { active: number; onClear: () => void; children: ReactNode }) {
  const { open, setOpen, ref } = usePopup();
  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={`${styles.trigger}${active || open ? ` ${styles.on}` : ""}`}
        aria-label={active ? `Filters, ${active} on` : "Filters"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Filters"
        onClick={() => setOpen(!open)}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        {active ? <span>{active}</span> : null}
      </button>
      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Filters">
          <div className={styles.head}>
            <strong>Filters</strong>
            {active ? (
              <button type="button" onClick={onClear}>
                Clear
              </button>
            ) : null}
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A labelled row inside the filter panel. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
