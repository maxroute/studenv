"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "studenv-library-open-pages";
/** Enough for any real library; older choices are dropped first. */
const LIMIT = 200;

/**
 * Which pages are open in the Library's tree. Pages start closed; the choice is
 * remembered on this device when the browser allows it.
 */
export function useOpenPages() {
  const [openPages, setOpenPages] = useState<ReadonlySet<string>>(() => new Set<string>());

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setOpenPages(new Set(saved.filter((id): id is string => typeof id === "string")));
    } catch {
      // Storage blocked or unreadable: everything starts closed.
    }
  }, []);

  const change = useCallback((id: string, open: boolean | "toggle") => {
    setOpenPages((current) => {
      const next = new Set(current);
      const wanted = open === "toggle" ? !current.has(id) : open;
      if (wanted) next.add(id);
      else next.delete(id);
      try {
        window.localStorage.setItem(KEY, JSON.stringify(Array.from(next).slice(-LIMIT)));
      } catch {
        // Not remembered; the tree still works.
      }
      return next;
    });
  }, []);

  return {
    openPages,
    togglePage: useCallback((id: string) => change(id, "toggle"), [change]),
    openPage: useCallback((id: string) => change(id, true), [change]),
  };
}
