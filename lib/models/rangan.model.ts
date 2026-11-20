import { z } from "zod";

/** Questions each student may ask Rangan per UTC day. */
export const RANGAN_DAILY_LIMIT = 25;

export const RANGAN_QUESTION_MAX = 2_000;
export const RANGAN_HISTORY_MAX_TURNS = 10;

const historyTurn = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4_000),
  })
  .strict();

/** Body of `POST /api/rangan/ask`. */
export const ranganAskSchema = z
  .object({
    question: z.string().trim().min(1, "Ask Rangan something.").max(RANGAN_QUESTION_MAX),
    history: z.array(historyTurn).max(RANGAN_HISTORY_MAX_TURNS).optional(),
  })
  .strict();

export type RanganAskInput = z.infer<typeof ranganAskSchema>;

export type RanganUsageSummary = {
  limit: number;
  used: number;
  remaining: number;
  /** Next UTC midnight, ISO string. */
  resetAt: string;
};
