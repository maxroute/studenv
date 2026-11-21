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

/** Rangan's floating button, and its panel once opened (loaded on demand). */
export function RanganHost() {
  const open = useRanganStore((state) => state.open);

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

  return open ? <RanganPanel /> : <RanganLauncher onPreload={preloadRanganPanel} />;
}
