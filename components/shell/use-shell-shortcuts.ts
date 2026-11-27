"use client";

import { useEffect } from "react";
import { useRanganStore } from "@/hooks/use-rangan-store";
import { useShellStore } from "./shell-store";

/** ⌘K searches, ⌘J opens Rangan and ⌘\ folds the sidebar (Ctrl on Windows and Linux). */
export function useShellShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // An editor that already used the keys (for example to add a link) wins.
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        const shell = useShellStore.getState();
        shell.setSearchOpen(!shell.searchOpen);
      } else if (key === "j") {
        event.preventDefault();
        useRanganStore.getState().openPanel();
      } else if (key === "\\") {
        event.preventDefault();
        useShellStore.getState().toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
