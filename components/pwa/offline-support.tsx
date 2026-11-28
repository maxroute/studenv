"use client";

import { useEffect } from "react";

/**
 * Registers the worker that shows Studenv's own "you're offline" page when a
 * page can't be loaded. It stores nothing else. Off in development.
 */
export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("Studenv's offline page isn't available:", error);
    });
  }, []);

  return null;
}
