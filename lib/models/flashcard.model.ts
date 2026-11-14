import { z } from "zod";
import { REF_MAX_LENGTH } from "@/lib/refs/ref-grammar";

const front = z.string().trim().min(1).max(2000);
const back = z.string().trim().max(4000);

export const createFlashcardSchema = z
  .object({
    front,
    back,
    /** What the card was made from, e.g. "note:<id>#b_…" or "asset:<id>#page4". */
    sourceRef: z.string().max(REF_MAX_LENGTH).optional(),
  })
  .strict();

export const updateFlashcardSchema = z.object({ front: front.optional(), back: back.optional() }).strict();

export const reviewFlashcardSchema = z
  .object({
    rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    elapsedMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  })
  .strict();

export type CreateFlashcardInput = z.infer<typeof createFlashcardSchema>;
export type UpdateFlashcardInput = z.infer<typeof updateFlashcardSchema>;
export type ReviewFlashcardInput = z.infer<typeof reviewFlashcardSchema>;
