import type { RanganUsageSummary } from "@/lib/models/rangan.model";
import { spendQuestion, type SpendDeps } from "@/lib/rangan/usage";

export type AllowanceDeps = SpendDeps;

export type WithQuestion = <T>(userId: string, run: (usage: RanganUsageSummary) => Promise<T>) => Promise<T>;

/**
 * The daily Rangan allowance for AI features outside Rangan's own service:
 * takes one question, runs `run`, and gives the question back if it fails.
 * A spent allowance is refused (429) before anything runs.
 */
export function createAllowance(deps: AllowanceDeps): WithQuestion {
  return (userId, run) =>
    spendQuestion(deps, userId, run, (usage) =>
      Object.assign(new Error(`You've used all ${usage.limit} Rangan questions for today. They reset at midnight UTC.`), {
        status: 429,
        details: { usage },
      }),
    );
}
