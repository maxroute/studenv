"use client";

import { useEffect } from "react";
import { SESSION_LABELS, useFocusStore } from "@/hooks/useFocusStore";
import { clockTime } from "@/lib/client/shell-nav";
import { sessionTitle } from "@/lib/client/tab-title";

/**
 * Shows the running session in the browser tab's name, and puts the page's own
 * name back when the session ends. It needs no permission and makes no sound.
 */
export function useSessionTitle() {
  const type = useFocusStore((state) => state.activeSession?.type ?? null);
  const paused = useFocusStore((state) => Boolean(state.activeSession?.pausedAt));
  const timeLeft = useFocusStore((state) => state.displayTimeLeft);
  const title = type ? sessionTitle(SESSION_LABELS[type], clockTime(timeLeft), paused) : null;

  useEffect(() => {
    if (!title) return;
    let own = document.title;
    const apply = () => {
      if (document.title === title) return;
      // Anything else here is the page's own name (set on load or on moving between pages).
      own = document.title;
      document.title = title;
    };
    apply();
    const watcher = new MutationObserver(apply);
    watcher.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      watcher.disconnect();
      if (document.title === title) document.title = own;
    };
  }, [title]);
}
