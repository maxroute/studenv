"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRanganStore } from "@/hooks/use-rangan-store";
import { RanganLauncher } from "./rangan-launcher";

const RanganPanel = dynamic(() => import("./rangan-panel").then((mod) => mod.RanganPanel), { ssr: false });

/** Starts loading the panel's code early (on hover, focus or touch of the button). */
function preloadRanganPanel() {
  void import("./rangan-panel");
}

/**
 * Rangan's panel once opened (loaded on demand). `launcher={false}` leaves out
 * the floating button where the frame already has its own Rangan entry.
 */
export function RanganHost({ launcher = true }: { launcher?: boolean }) {
  const open = useRanganStore((state) => state.open);

  // The sidebar's Rangan button has no hover preload, so the panel's code is
  // fetched once the page is idle: the first click then opens it at once.
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(preloadRanganPanel, { timeout: 4_000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(preloadRanganPanel, 2_000);
    return () => window.clearTimeout(timer);
  }, []);

  // Coming back to this tab or device with the panel open shows the true count
  // at once: another tab or device may have spent questions in the meantime.
  useEffect(() => {
    const refresh = () => {
      const store = useRanganStore.getState();
      if (document.visibilityState === "visible" && store.open) void store.refreshUsage();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (open) return <RanganPanel />;
  return launcher ? <RanganLauncher onPreload={preloadRanganPanel} /> : null;
}
