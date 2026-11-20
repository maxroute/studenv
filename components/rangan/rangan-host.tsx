"use client";

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
  return open ? <RanganPanel /> : <RanganLauncher onPreload={preloadRanganPanel} />;
}
