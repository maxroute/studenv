"use client";

import { useEffect } from "react";

/**
 * Wakes the server and database while a visitor is on a page that leads to
 * the app. Sends nothing and shows nothing; once per page load, best effort.
 */
export function WarmUp() {
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/warm", { cache: "no-store", signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return null;
}
