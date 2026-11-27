"use client";

import { ClockDigits } from "@/components/ui/clock-digits";
import { useFocusStore } from "@/hooks/useFocusStore";
import { clockTime } from "@/lib/client/shell-nav";

/** The time left in the running session; nothing when no session is on. */
export function FocusClock() {
  const running = useFocusStore((state) => state.activeSession !== null);
  const paused = useFocusStore((state) => Boolean(state.activeSession?.pausedAt));
  const timeLeft = useFocusStore((state) => state.displayTimeLeft);
  if (!running) return null;
  return (
    <span className={`shell-clock${paused ? " paused" : ""}`} aria-label={`${paused ? "Paused" : "Running"}, ${clockTime(timeLeft)} left`}>
      <ClockDigits value={clockTime(timeLeft)} />
    </span>
  );
}
