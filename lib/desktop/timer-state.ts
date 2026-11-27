/**
 * What the desktop app is told about the focus timer. The page owns the session;
 * the desktop's small timer only shows this and asks for changes.
 */
import type { SessionType } from "@/hooks/useFocusStore";

const LABELS: Record<SessionType, string> = {
  focus: "Focus",
  shortBreak: "Short break",
  longBreak: "Long break",
};

/** The goal the timer gives a focus session that was started without one. */
const UNNAMED_GOAL = "Untitled focus block";

export type DesktopTimerState =
  | { status: "idle" }
  | {
      status: "running";
      sessionId: string;
      label: string;
      title: string;
      /** When the session ends, so the desktop can count down by itself. */
      endsAt: number;
      durationMs: number;
    }
  | { status: "paused"; sessionId: string; label: string; title: string; remainingMs: number; durationMs: number }
  | { status: "finished"; sessionId: string; label: string; title: string; canStartBreak: boolean };

export type DesktopTimerCommand = "pause" | "resume" | "startBreak";

export interface TimerSnapshot {
  activeSession: {
    id: string;
    type: SessionType;
    goal: string;
    durationMs: number;
    expectedEndAt: number;
    pausedAt: number | null;
  } | null;
  selectedType: SessionType;
  /** Set for a moment when a session ran out (not when it was reset or skipped). */
  pendingCompletion: unknown;
}

function sessionName(session: NonNullable<TimerSnapshot["activeSession"]>) {
  const label = LABELS[session.type];
  const goal = session.goal.trim();
  return { label, title: goal && goal !== label && goal !== UNNAMED_GOAL ? goal.slice(0, 200) : "" };
}

export function desktopTimerState(
  current: TimerSnapshot,
  previous: TimerSnapshot | null,
  lastSent: DesktopTimerState,
): DesktopTimerState {
  const session = current.activeSession;
  if (session) {
    const base = { sessionId: session.id, ...sessionName(session), durationMs: session.durationMs };
    return session.pausedAt === null
      ? { status: "running", ...base, endsAt: session.expectedEndAt }
      : { status: "paused", ...base, remainingMs: Math.max(0, session.expectedEndAt - session.pausedAt) };
  }

  const ended = previous?.activeSession;
  if (ended && current.pendingCompletion) {
    return {
      status: "finished",
      sessionId: ended.id,
      ...sessionName(ended),
      canStartBreak: current.selectedType !== "focus",
    };
  }

  // "Finished" lasts until another session starts or another kind is picked.
  if (lastSent.status === "finished" && previous?.selectedType === current.selectedType) return lastSent;
  return { status: "idle" };
}
