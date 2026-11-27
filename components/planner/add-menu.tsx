"use client";

import { Plus } from "lucide-react";
import { RanganLogo } from "@/components/rangan/rangan-launcher";
import { usePopup } from "@/components/shell/use-popup";
import styles from "./task-menu.module.css";

/** The planner's one Add button: a task by hand, or a plan from Rangan. */
export function AddMenu({ onNewTask, onPlan }: { onNewTask: () => void; onPlan: () => void }) {
  const { open, setOpen, ref } = usePopup();
  const choose = (run: () => void) => () => {
    setOpen(false);
    run();
  };
  return (
    <div className={styles.wrap} ref={ref}>
      <button type="button" className={styles.add} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Plus size={16} strokeWidth={2.6} aria-hidden="true" /> Add
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <button type="button" role="menuitem" onClick={choose(onNewTask)}>
            <Plus size={14} aria-hidden="true" /> New task
          </button>
          <button type="button" role="menuitem" onClick={choose(onPlan)}>
            <RanganLogo size={16} /> Plan with Rangan
          </button>
        </div>
      ) : null}
    </div>
  );
}
