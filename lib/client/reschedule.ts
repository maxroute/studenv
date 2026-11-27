/** Moving planner tasks to new days. */
export type MovableTask = { id: string; priority: string; dueDate: string | null; dueTime: string | null };
export type DueChange = { id: string; dueDate: string | null; dueTime: string | null };

/** How a calendar day is stored: midnight UTC of the student's own year, month and day. */
export function dayToDueDate(day: Date): string {
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())).toISOString();
}

const addDays = (day: Date, days: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);

/**
 * The task on its new day. A time already past today is cleared, or the task
 * would be overdue again the moment it moved.
 */
export function moveTask(task: Pick<MovableTask, "id" | "dueTime">, day: Date, now: Date): DueChange {
  let dueTime = task.dueTime;
  if (dueTime && day.toDateString() === now.toDateString()) {
    const [hours, minutes] = dueTime.split(":").map(Number);
    if (new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes).getTime() <= now.getTime()) dueTime = null;
  }
  return { id: task.id, dueDate: dayToDueDate(day), dueTime };
}

export const SPREAD_DAYS = 7;
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Shares tasks evenly over the days starting today. The most urgent, then the
 * longest waiting, come first; earlier days take any extra.
 */
export function spreadTasks(tasks: MovableTask[], now: Date, days = SPREAD_DAYS): DueChange[] {
  const ordered = [...tasks].sort(
    (a, b) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""),
  );
  const base = Math.floor(ordered.length / days);
  const extra = ordered.length % days;
  const changes: DueChange[] = [];
  let next = 0;
  for (let day = 0; day < days && next < ordered.length; day += 1) {
    const count = base + (day < extra ? 1 : 0);
    for (const task of ordered.slice(next, next + count)) changes.push(moveTask(task, addDays(now, day), now));
    next += count;
  }
  return changes;
}

/** Where the tasks were, to put them back. */
export function previousDates(tasks: Array<Pick<MovableTask, "id" | "dueDate" | "dueTime">>): DueChange[] {
  return tasks.map(({ id, dueDate, dueTime }) => ({ id, dueDate, dueTime }));
}
