"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { CalendarPlus, FilePlus2 } from "lucide-react";
import { createEmptyPage } from "@/lib/client/create-page";
import { usePopup } from "./use-popup";

/** The New button: starts a page or a planner task. */
export function NewMenu({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { open, setOpen, ref } = usePopup();
  const [creating, setCreating] = useState(false);

  async function newPage() {
    setOpen(false);
    setCreating(true);
    try {
      router.push(`/notes/${await createEmptyPage()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The page could not be created.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="shell-popup-wrap shell-new-wrap" ref={ref}>
      <button type="button" className="shell-new" aria-haspopup="menu" aria-expanded={open} disabled={creating} onClick={() => setOpen(!open)}>
        {children}
      </button>
      {open ? (
        <div className="shell-popup" role="menu">
          <button type="button" role="menuitem" onClick={() => void newPage()}>
            <FilePlus2 size={15} aria-hidden="true" /> New page
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/dashboard/planner?new=1");
            }}
          >
            <CalendarPlus size={15} aria-hidden="true" /> New task
          </button>
        </div>
      ) : null}
    </div>
  );
}
