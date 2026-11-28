// ---------------------------------------------------------------------------
// Rangan's daily questions: one summary shape and one way to spend them (pure)
// ---------------------------------------------------------------------------
//
// Every feature that uses a daily question (chat, pages, boards, study plans,
// flashcards, quizzes) builds the same summary and spends the same way: take a
// question, run the work, give it back if the work fails. Each summary says
// when it was true (`asOf`), so a screen can ignore a reply that arrives late
// and show an older count than one it already has.

import type { RanganUsageSummary } from "@/lib/models/rangan.model";

const DAY_MS = 86_400_000;

/** The summary of `used` questions of `limit` on `day` (a UTC midnight), true at `asOf`. */
export function usageSummary(limit: number, used: number, day: Date, asOf: Date): RanganUsageSummary {
  const clamped = Math.min(Math.max(used, 0), limit);
  return {
    limit,
    used: clamped,
    remaining: limit - clamped,
    resetAt: new Date(day.getTime() + DAY_MS).toISOString(),
    asOf: asOf.toISOString(),
  };
}

/** True for a well-formed summary; anything else (including from the network) is not trusted. */
export function isUsageSummary(value: unknown): value is RanganUsageSummary {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100_000;
  return (
    whole(v.limit) &&
    whole(v.used) &&
    whole(v.remaining) &&
    v.used + v.remaining === v.limit &&
    typeof v.resetAt === "string" &&
    !Number.isNaN(Date.parse(v.resetAt)) &&
    typeof v.asOf === "string" &&
    !Number.isNaN(Date.parse(v.asOf))
  );
}

/** A clean copy holding only the five known fields, or null when `value` isn't a well-formed summary. */
export function pickUsage(value: unknown): RanganUsageSummary | null {
  if (!isUsageSummary(value)) return null;
  const { limit, used, remaining, resetAt, asOf } = value;
  return { limit, used, remaining, resetAt, asOf };
}

/**
 * The usage in a response body, wherever the route put it: at the top, under
 * `details` (an error), or under `data` (the study routes wrap their result).
 */
export function usageFromBody(body: unknown): RanganUsageSummary | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as { usage?: unknown; details?: { usage?: unknown } | null; data?: { usage?: unknown } | null };
  return pickUsage(b.usage ?? b.details?.usage ?? b.data?.usage);
}

/**
 * Which of two summaries to show. A later day always wins (its reset time is
 * later); within a day the one that was true more recently wins, and a tie
 * goes to the newcomer. Without `current`, the newcomer is shown.
 */
export function mergeUsage(current: RanganUsageSummary | null, incoming: RanganUsageSummary | null): RanganUsageSummary | null {
  if (!incoming) return current;
  if (!current) return incoming;
  const nextDay = Date.parse(incoming.resetAt) - Date.parse(current.resetAt);
  if (nextDay !== 0) return nextDay > 0 ? incoming : current;
  return Date.parse(incoming.asOf) >= Date.parse(current.asOf) ? incoming : current;
}

/** When the count resets, in the reader's own time ("5:30 am"). */
export function resetLabel(resetAt: string, options: { locale?: string; timeZone?: string } = {}): string {
  const time = Date.parse(resetAt);
  if (Number.isNaN(time)) return "";
  return new Intl.DateTimeFormat(options.locale ?? undefined, { hour: "numeric", hour12: true, minute: "2-digit", timeZone: options.timeZone }).format(new Date(time)).toLowerCase();
}

export type SpendDeps = {
  dailyLimit: number;
  now: () => Date;
  getUsedCount: (userId: string, day: Date) => Promise<number>;
  consumeQuestion: (userId: string, day: Date, limit: number) => Promise<{ allowed: boolean; used: number }>;
  refundQuestion: (userId: string, day: Date) => Promise<void>;
};

/** The UTC midnight that starts the day containing `date`. */
export function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** `error` with the count as it stands, so a failed request still tells the screen the true number. */
export function withUsage<E>(error: E, usage: RanganUsageSummary): E {
  if (error && typeof error === "object") Object.assign(error, { usage });
  return error;
}

/**
 * Takes one question from today's allowance, runs `run`, and gives the
 * question back if `run` fails. A spent allowance is refused before anything
 * runs. Every error leaves here carrying the true count (`error.usage`).
 */
export async function spendQuestion<T>(
  deps: SpendDeps,
  userId: string,
  run: (usage: RanganUsageSummary) => Promise<T>,
  spent: (usage: RanganUsageSummary) => Error,
): Promise<T> {
  const day = utcDayStart(deps.now());
  const taken = await deps.consumeQuestion(userId, day, deps.dailyLimit);
  const usage = usageSummary(deps.dailyLimit, taken.used, day, deps.now());
  if (!taken.allowed) throw withUsage(spent(usage), usage);
  try {
    return await run(usage);
  } catch (error) {
    await deps.refundQuestion(userId, day);
    let after = usage;
    try {
      after = usageSummary(deps.dailyLimit, await deps.getUsedCount(userId, day), day, deps.now());
    } catch {
      // The refund still happened; the screen just shows its last number.
    }
    throw withUsage(error, after);
  }
}
