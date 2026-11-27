/** What each day of the study calendar shows: focus time, and how its tasks went. */
import { isDueOn } from "./planner-tasks";

export type FocusRecord = { startedAt: string; durationMs: number };
export type CalendarTask = { status: string; dueDate: string | null; missedDueDates?: string[] };

export type StudyDay = {
  focusMs: number;
  /** How strongly the day is filled: 0 none, 1 under 30 minutes, 2 under 90, 3 longer. */
  level: 0 | 1 | 2 | 3;
  tasks: number;
  done: number;
  /** Tasks left unfinished on this day and later moved away. */
  missed: number;
  /** Every task due that day is finished, and none was moved away unfinished. */
  allDone: boolean;
  /** Open tasks due today or later. */
  upcoming: boolean;
  /** Open tasks left on a day that has passed. */
  unfinished: boolean;
};

/** A calendar day in the student's own time zone, as `2026-11-27`. */
export function dayKey(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

export function focusByDay(records: FocusRecord[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const record of records) {
    const key = dayKey(new Date(record.startedAt));
    totals.set(key, (totals.get(key) ?? 0) + record.durationMs);
  }
  return totals;
}

const fillLevel = (focusMs: number): StudyDay["level"] => (focusMs <= 0 ? 0 : focusMs < 30 * 60_000 ? 1 : focusMs < 90 * 60_000 ? 2 : 3);

export function studyDay(day: Date, tasks: CalendarTask[], focus: Map<string, number>, now: Date): StudyDay {
  const focusMs = focus.get(dayKey(day)) ?? 0;
  const due = tasks.filter((task) => task.status !== "cancelled" && isDueOn(task.dueDate, day));
  const done = due.filter((task) => task.status === "completed").length;
  const open = due.length - done;
  const missed = tasks.filter((task) => task.missedDueDates?.some((date) => isDueOn(date, day))).length;
  const past = dayKey(day) < dayKey(now);
  return {
    focusMs,
    level: fillLevel(focusMs),
    tasks: due.length,
    done,
    missed,
    allDone: due.length > 0 && open === 0 && missed === 0,
    upcoming: open > 0 && !past,
    unfinished: (open > 0 && past) || missed > 0,
  };
}

/** `45 min`, `1 h`, `12 h 5 min`. */
export function focusLabel(focusMs: number): string {
  const minutes = Math.round(focusMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`;
}

/** The day in words, for the line under the calendar and for screen readers. */
export function describeDay(info: StudyDay): string {
  const parts = [info.focusMs > 0 ? `${focusLabel(info.focusMs)} focused` : "No focus time"];
  if (info.tasks > 0) parts.push(`${info.done} of ${info.tasks} task${info.tasks === 1 ? "" : "s"} done`);
  else if (info.missed === 0) parts.push("no tasks");
  if (info.missed > 0) parts.push(`${info.missed} missed`);
  return parts.join(" · ");
}
