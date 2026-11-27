/** The numbers and words at the top of Home: the streak line and the overdue alert. */
import { dayKey } from "./study-calendar";
import { taskDueAt, type DatedTask } from "./planner-tasks";

/** From the Sunday that starts this week (as the study calendar does) up to the end of today. */
export function weekSoFar(now: Date): { from: Date; to: Date } {
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return { from: day(-now.getDay()), to: day(1) };
}

/** Focus time today and over the week so far, from per-day totals. */
export function focusTotals(days: Map<string, number>, now: Date): { todayMs: number; weekMs: number } {
  const { from, to } = weekSoFar(now);
  const first = dayKey(from);
  const end = dayKey(to);
  let weekMs = 0;
  for (const [key, ms] of Array.from(days)) {
    if (key >= first && key < end) weekMs += ms;
  }
  return { todayMs: days.get(dayKey(now)) ?? 0, weekMs };
}

/** How far back the overdue work goes: `Sun, Nov 22`, or `today` when a time earlier today has passed. */
export function oldestOverdueLabel(tasks: Array<Pick<DatedTask, "dueDate" | "dueTime">>, now: Date): string | null {
  let oldest: { at: number; date: string } | null = null;
  for (const task of tasks) {
    const at = taskDueAt(task);
    if (at !== null && task.dueDate && (!oldest || at < oldest.at)) oldest = { at, date: task.dueDate };
  }
  if (!oldest) return null;
  // A due date is stored as UTC midnight of its day, so it is read back in UTC.
  const due = new Date(oldest.date);
  if (due.toISOString().slice(0, 10) === dayKey(now)) return "today";
  return due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
