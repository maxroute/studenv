/** Date rules for planner tasks, shared by Home and the Planner. */
export type DatedTask = { status: string; dueDate: string | null; dueTime: string | null };

/** When a task is due, in the student's own time zone. Due dates are stored as UTC midnight of that day. */
export function taskDueAt(task: Pick<DatedTask, "dueDate" | "dueTime">): number | null {
  if (!task.dueDate) return null;
  const date = new Date(task.dueDate);
  const [hours, minutes] = (task.dueTime || "23:59").split(":").map(Number);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes).getTime();
}

/** Whether a stored due date is the calendar day of `day`. */
export function isDueOn(dueDate: string | null, day: Date): boolean {
  if (!dueDate) return false;
  const date = new Date(dueDate);
  return date.getUTCDate() === day.getDate() && date.getUTCMonth() === day.getMonth() && date.getUTCFullYear() === day.getFullYear();
}

const isOpen = (task: DatedTask) => task.status !== "completed" && task.status !== "cancelled";

export function isOverdueTask(task: DatedTask, now: number): boolean {
  const dueAt = taskDueAt(task);
  return isOpen(task) && dueAt !== null && dueAt < now;
}

export type TaskGroupKey = "overdue" | "today" | "tomorrow" | "later" | "someday";

export const TASK_GROUP_LABELS: Record<TaskGroupKey, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  later: "Later",
  someday: "No date",
};

/**
 * Open tasks under Overdue, Today, Tomorrow, Later and No date, keeping the
 * given order inside each group. Empty groups are left out.
 */
export function groupOpenTasks<T extends DatedTask>(tasks: T[], now: Date): Array<{ key: TaskGroupKey; label: string; tasks: T[] }> {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const groups: Record<TaskGroupKey, T[]> = { overdue: [], today: [], tomorrow: [], later: [], someday: [] };
  for (const task of tasks) {
    if (!isOpen(task)) continue;
    if (isOverdueTask(task, now.getTime())) groups.overdue.push(task);
    else if (!task.dueDate) groups.someday.push(task);
    else if (isDueOn(task.dueDate, now)) groups.today.push(task);
    else if (isDueOn(task.dueDate, tomorrow)) groups.tomorrow.push(task);
    else groups.later.push(task);
  }
  return (Object.keys(groups) as TaskGroupKey[])
    .filter((key) => groups[key].length > 0)
    .map((key) => ({ key, label: TASK_GROUP_LABELS[key], tasks: groups[key] }));
}
