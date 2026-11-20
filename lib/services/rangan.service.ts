import type { ChatMessage, CompletionOptions, CompletionResult, ProviderId } from "@/lib/ai/providers";
import type { RanganAskInput, RanganUsageSummary } from "@/lib/models/rangan.model";

export type RanganDeps = {
  dailyLimit: number;
  now: () => Date;
  getUsedCount: (userId: string, day: Date) => Promise<number>;
  consumeQuestion: (userId: string, day: Date, limit: number) => Promise<{ allowed: boolean; used: number }>;
  refundQuestion: (userId: string, day: Date) => Promise<void>;
  complete: (messages: ChatMessage[], options?: CompletionOptions) => Promise<CompletionResult>;
};

export type RanganAnswer = {
  answer: string;
  provider: ProviderId;
  usage: RanganUsageSummary;
};

export const RANGAN_SYSTEM_PROMPT = [
  "You are Rangan, the librarian and learning companion inside Studenv, a study app.",
  "Help the student understand, connect and remember what they are studying.",
  "Be clear and concise. Use short paragraphs or lists, and Markdown where it helps.",
  "If you are not sure of something, say so instead of guessing.",
  "You cannot see the student's library yet unless they paste text into the question.",
].join(" ");

/** The UTC midnight that starts the day containing `date`. */
export function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function usageSummary(limit: number, used: number, day: Date): RanganUsageSummary {
  const clamped = Math.min(Math.max(used, 0), limit);
  return {
    limit,
    used: clamped,
    remaining: limit - clamped,
    resetAt: new Date(day.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function allowanceSpent(usage: RanganUsageSummary) {
  return Object.assign(
    new Error(`You've used all ${usage.limit} Rangan questions for today. They reset at midnight UTC.`),
    { status: 429, details: { usage } },
  );
}

export function createRanganService(deps: RanganDeps) {
  async function getUsage(userId: string): Promise<RanganUsageSummary> {
    const day = utcDayStart(deps.now());
    return usageSummary(deps.dailyLimit, await deps.getUsedCount(userId, day), day);
  }

  async function ask(userId: string, input: RanganAskInput): Promise<RanganAnswer> {
    const day = utcDayStart(deps.now());
    const taken = await deps.consumeQuestion(userId, day, deps.dailyLimit);
    if (!taken.allowed) throw allowanceSpent(usageSummary(deps.dailyLimit, taken.used, day));

    const messages: ChatMessage[] = [
      { role: "system", content: RANGAN_SYSTEM_PROMPT },
      ...(input.history ?? []),
      { role: "user", content: input.question },
    ];
    try {
      const result = await deps.complete(messages);
      return {
        answer: result.text,
        provider: result.provider,
        usage: usageSummary(deps.dailyLimit, taken.used, day),
      };
    } catch (error) {
      // No model answered: the question is given back before the error surfaces.
      await deps.refundQuestion(userId, day);
      throw error;
    }
  }

  return { ask, getUsage };
}
