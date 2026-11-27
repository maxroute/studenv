/**
 * The days a task was left unfinished on and then moved away from, so the study
 * calendar does not show such a day as completed. Days are stored like due
 * dates: midnight UTC of the student's own calendar day. Pure.
 */
export type MissedMove = {
  missed: Date[];
  /** The task's status before the change, and the one the change sets, if any. */
  status: string;
  nextStatus?: string;
  from: Date | null;
  to: Date | null;
  /** The student's today, as a stored day. Only days before it can be missed. */
  today: Date;
};

const DAY_MS = 86_400_000;
const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const isClosed = (status: string | undefined) => status === "completed" || status === "cancelled";
/** Enough for a year of daily slips; the oldest fall away first. */
const MAX_MISSED_DAYS = 366;

export function nextMissedDays({ missed, status, nextStatus, from, to, today }: MissedMove): Date[] {
  const days = new Map(missed.map((date) => [dayOf(date), date]));
  const target = to ? dayOf(to) : null;
  // A task back on a day is simply on that day again (this is also how Undo works).
  if (target) days.delete(target);
  const origin = from ? dayOf(from) : null;
  const movedOn = origin !== null && (target === null || target > origin);
  if (movedOn && origin < dayOf(today) && !isClosed(status) && !isClosed(nextStatus)) {
    days.set(origin, new Date(`${origin}T00:00:00.000Z`));
  }
  return [...days.keys()].sort().slice(-MAX_MISSED_DAYS).map((key) => days.get(key)!);
}

/**
 * The student's today, from what the app sent. Time zones put it at most a day
 * either side of the server's date; anything further is refused (null). Without
 * it (an older open tab), only days past in every time zone count.
 */
export function studentToday(sent: string | undefined, now: Date): Date | null {
  const serverDay = Date.parse(`${dayOf(now)}T00:00:00.000Z`);
  if (sent === undefined) return new Date(serverDay - DAY_MS);
  const day = Date.parse(`${sent.slice(0, 10)}T00:00:00.000Z`);
  return Math.abs(day - serverDay) <= DAY_MS ? new Date(day) : null;
}
