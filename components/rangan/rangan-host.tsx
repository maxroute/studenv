"use client";

import dynamic from "next/dynamic";
import { useRanganStore } from "@/hooks/use-rangan-store";

const RanganPanel = dynamic(() => import("./rangan-panel").then((mod) => mod.RanganPanel), { ssr: false });

/** Loads Rangan's panel only when it is opened. */
export function RanganHost() {
  const open = useRanganStore((state) => state.open);
  return open ? <RanganPanel /> : null;
}

/** Starts loading the panel's code early (on hover or focus of its button). */
export function preloadRanganPanel() {
  void import("./rangan-panel");
}
