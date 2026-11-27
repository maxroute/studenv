"use client";

import Link from "next/link";
import { ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { ClockDigits } from "@/components/ui/clock-digits";
import { SESSION_LABELS, useFocusStore } from "@/hooks/useFocusStore";
import { clockTime } from "@/lib/client/shell-nav";
import styles from "./planner-focus-card.module.css";

/** The running Focus session, seen from the Planner. The same timer as the Focus page. */
export function PlannerFocusCard() {
  const session = useFocusStore((state) => state.activeSession);
  const timeLeft = useFocusStore((state) => state.displayTimeLeft);
  const paused = Boolean(session?.pausedAt);
  const progress = session ? Math.min(100, Math.max(0, 100 - (timeLeft * 1000 * 100) / session.durationMs)) : 0;

  // Nothing running means nothing to show: the sidebar and each task start a session.
  if (!session) return null;

  return (
    <section className={styles.card} aria-labelledby="plannerFocus">
      <div className={styles.head}>
        <h2 id="plannerFocus">{`${SESSION_LABELS[session.type]}${paused ? " · paused" : ""}`}</h2>
        <Link href="/dashboard/focus">
          Open Focus <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
      <strong className={styles.time}><ClockDigits value={clockTime(timeLeft)} /></strong>
      <p className={styles.goal}>{session.goal}</p>
      <div className={styles.track} role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={() => (paused ? useFocusStore.getState().resumeTimer() : useFocusStore.getState().pauseTimer())}>
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button type="button" onClick={() => useFocusStore.getState().resetTimer()}>
          <RotateCcw size={14} aria-hidden="true" />
          Reset
        </button>
      </div>
    </section>
  );
}
