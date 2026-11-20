import type { RanganUsageSummary } from "@/lib/models/rangan.model";
import { utcDayStart } from "@/lib/services/rangan.service";

export type AllowanceDeps = {
  dailyLimit: number;
  now: () => Date;
  consumeQuestion: (userId: string, day: Date, limit: number) => Promise<{ allowed: boolean; used: number }>;
  refundQuestion: (userId: string, day: Date) => Promise<void>;
};

export type WithQuestion = <T>(userId: string, run: (usage: RanganUsageSummary) => Promise<T>) => Promise<T>;

/**
 * The daily Rangan allowance for AI features outside Rangan's own service:
 * takes one question, runs `run`, and gives the question back if it fails.
 * A spent allowance is refused (429) before anything runs.
 */
export function createAllowance(deps: AllowanceDeps): WithQuestion {
  return async function withQuestion(userId, run) {
    const day = utcDayStart(deps.now());
    const taken = await deps.consumeQuestion(userId, day, deps.dailyLimit);
    const used = Math.min(Math.max(taken.used, 0), deps.dailyLimit);
    const usage: RanganUsageSummary = {
      limit: deps.dailyLimit,
      used,
      remaining: deps.dailyLimit - used,
      resetAt: new Date(day.getTime() + 86_400_000).toISOString(),
    };
    if (!taken.allowed) {
      throw Object.assign(new Error(`You've used all ${usage.limit} Rangan questions for today. They reset at midnight UTC.`), {
        status: 429,
        details: { usage },
      });
    }
    try {
      return await run(usage);
    } catch (error) {
      await deps.refundQuestion(userId, day);
      throw error;
    }
  };
}
