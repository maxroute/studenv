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
export const RANGAN_FOCUS_MAX = 4_000;

/** Text the student selected and asked about ("Explain this"). */
const focusSchema = z
  .object({
    text: z.string().trim().min(1).max(RANGAN_FOCUS_MAX),
    /** Title of the page it was selected on, for context only. */
    title: z.string().trim().max(500).optional(),
  })
  .strict();

export const ranganAskSchema = z
  .object({
    question: z.string().trim().min(1, "Ask Rangan something.").max(RANGAN_QUESTION_MAX),
    history: z.array(historyTurn).max(RANGAN_HISTORY_MAX_TURNS).optional(),
    focus: focusSchema.optional(),
    /**
     * The page open in front of the student, as the editor shows it right now
     * (unsaved typing included), so Rangan can change it when asked.
     */
    page: z
      .object({
        ref: z.string().trim().min(1).max(420),
        title: z.string().max(500),
        blocks: z
          .array(z.object({ type: z.string().min(1).max(40), text: z.string().max(4_000), locked: z.boolean() }).strict())
          .max(400),
      })
      .strict()
      .optional(),
    /** The board open in front of the student, described by short keys, so Rangan can add to it when asked. */
    board: z
      .object({
        ref: z.string().trim().min(1).max(420),
        title: z.string().max(500),
        elements: z
          .array(z.object({ key: z.string().regex(/^e\d{1,4}$/), type: z.string().min(1).max(40), text: z.string().max(400), selected: z.boolean(), locked: z.boolean() }).strict())
          .max(200),
        edges: z.array(z.object({ from: z.string().max(8), to: z.string().max(8), label: z.string().max(60) }).strict()).max(400),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Body of `POST /api/rangan/summarize`: a page (`note:<id>`) or a PDF or video (`asset:<id>`). */
export const ranganSummarizeSchema = z
  .object({
    ref: z.string().trim().min(1).max(420),
  })
  .strict();

export type RanganSummarizeInput = z.infer<typeof ranganSummarizeSchema>;

export type RanganAskInput = z.infer<typeof ranganAskSchema>;

export type RanganUsageSummary = {
  limit: number;
  used: number;
  remaining: number;
  /** Next UTC midnight, ISO string. */
  resetAt: string;
  /** When this count was true, ISO string: a screen ignores a summary older than the one it shows. */
  asOf: string;
};

/** Query of `GET /api/rangan/search`. */
export const ranganSearchSchema = z
  .object({
    q: z.string().trim().min(1, "Type something to search for.").max(500),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  })
  .strict();

/** Body of `POST /api/rangan/explore`: the page to explore from; without one, the most recently edited page. */
export const ranganExploreSchema = z.object({ ref: z.string().trim().min(1).max(420).optional() }).strict();

export type RanganExploreInput = z.infer<typeof ranganExploreSchema>;
