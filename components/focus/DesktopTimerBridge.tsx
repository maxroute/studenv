"use client";

import { useDesktopTimer } from "@/hooks/use-desktop-timer";

/** Sits at the root so the desktop timer keeps working on every page, boards included. */
export function DesktopTimerBridge() {
  useDesktopTimer();
  return null;
}
