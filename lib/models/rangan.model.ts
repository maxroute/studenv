import { z } from "zod";
import { APP_AREAS } from "@/lib/rangan/task";
import { CONVERSATION_TITLE_MAX, MAX_SAVED_TURNS, MAX_TURNS_PER_SAVE, SAVED_TURN_ROLES, TURN_ID, type StoredTurn } from "@/lib/rangan/conversation";

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
          .array(
            z
              .object({
                /** The block's id, so Rangan's steps can name it (older panels send none). */
                id: z.string().min(1).max(80).optional(),
                type: z.string().min(1).max(40),
                text: z.string().max(4_000),
                /** The text with formatting and links in light Markdown. */
                marked: z.string().max(4_000).optional(),
                locked: z.boolean(),
              })
              .strict(),
          )
          .max(400),
        /** Text the student has selected on the page, and the block it is in. */
        selection: z.object({ block: z.string().min(1).max(80), text: z.string().max(2_000) }).strict().optional(),
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
    /** The part of the app the student asked from; it only settles unclear requests. */
    where: z.enum(APP_AREAS).optional(),
    /** The student's own day and time, so "before midnight" means their midnight. */
    clock: z
      .object({
        today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        timeZone: z.string().trim().max(64).optional(),
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

// --- Saved chats ----------------------------------------------------------------

/** Body of `POST /api/rangan/conversations` and `PATCH /api/rangan/conversations/[id]`. */
export const ranganConversationTitleSchema = z
  .object({ title: z.string().trim().min(1, "Give the chat a name.").max(CONVERSATION_TITLE_MAX) })
  .strict();

/** Body of `POST /api/rangan/conversations/[id]/turns`: new turns, or turns whose card changed. */
export const ranganTurnsSchema = z
  .object({
    turns: z
      .array(
        z
          .object({
            clientId: z.string().regex(TURN_ID),
            position: z.number().int().min(0).max(MAX_SAVED_TURNS - 1),
            role: z.enum(SAVED_TURN_ROLES),
            data: z.record(z.unknown()),
          })
          .strict(),
      )
      .max(MAX_TURNS_PER_SAVE),
    /** Turns no longer in the chat (a question sent again after an error), by the panel's id. */
    remove: z.array(z.string().regex(TURN_ID)).max(MAX_TURNS_PER_SAVE).optional(),
  })
  .strict()
  .refine((body) => body.turns.length > 0 || (body.remove?.length ?? 0) > 0, "Nothing to save.");

export type RanganTurnsInput = z.infer<typeof ranganTurnsSchema>;

/** A saved chat in the history list. */
export type RanganConversationSummary = { id: string; title: string; updatedAt: string };

/** A saved chat with its turns, oldest first. */
export type RanganConversationRecord = RanganConversationSummary & { turns: StoredTurn[] };
