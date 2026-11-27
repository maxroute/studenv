"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { CalendarArrowUp, CalendarCheck, Copy, Edit2, MoreHorizontal, Trash2 } from "lucide-react";
import { usePopup } from "@/components/shell/use-popup";
import styles from "./task-menu.module.css";

type Action = (event: ReactMouseEvent) => void;

/** Everything else a task can do, behind one button. */
export function TaskMenu({ title, onEdit, onDuplicate, onToday, onTomorrow, onDelete }: { title: string; onEdit: Action; onDuplicate: Action; onToday: Action; onTomorrow: Action; onDelete: Action }) {
  const { open, setOpen, ref } = usePopup();
  const items: Array<{ label: string; icon: typeof Copy; run: Action; danger?: boolean }> = [
    { label: "Edit", icon: Edit2, run: onEdit },
    { label: "Duplicate", icon: Copy, run: onDuplicate },
    { label: "Move to today", icon: CalendarCheck, run: onToday },
    { label: "Move to tomorrow", icon: CalendarArrowUp, run: onTomorrow },
    { label: "Delete", icon: Trash2, run: onDelete, danger: true },
  ];

  return (
    <div className={styles.wrap} ref={ref} onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" className={styles.trigger} aria-label={`More for ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          {items.map(({ label, icon: Icon, run, danger }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={danger ? styles.danger : undefined}
              onClick={(event) => {
                setOpen(false);
                run(event);
              }}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
