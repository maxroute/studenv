import { z } from "zod";

/** Upper bound on source text sent to the model (the request body itself is capped at 100 KB). */
export const AI_TEXT_MAX = 80_000;

const sourceText = z.string().trim().min(1, "Text is required.").max(AI_TEXT_MAX);
const assetId = z.string().regex(/^c[a-z0-9]{24,}$/, "Invalid asset id.");

const chatTurn = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8_000),
  })
  .strict();

/** Body of `POST /api/ai/generate`, one shape per action. */
export const aiGenerateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("summary"), text: sourceText, assetId: assetId.optional() }).strict(),
  z
    .object({
      action: z.literal("flashcards"),
      text: sourceText,
      assetId: assetId.optional(),
      /** Replace earlier AI cards that were never reviewed or edited; reviewed and edited cards are kept. */
      regenerate: z.boolean().optional(),
    })
    .strict(),
  z.object({ action: z.literal("quiz"), text: sourceText }).strict(),
  z
    .object({
      action: z.literal("chat"),
      text: sourceText,
      userMessage: z.string().trim().min(1, "Message is required.").max(4_000),
      history: z.array(chatTurn).max(50).default([]),
    })
    .strict(),
]);

export type AiGenerateInput = z.infer<typeof aiGenerateSchema>;

/** One card as returned by the model; anything else in its output is dropped. */
export const generatedFlashcardSchema = z.object({
  front: z.string().trim().min(1).max(2_000),
  back: z.string().trim().min(1).max(4_000),
});

export type GeneratedFlashcard = z.infer<typeof generatedFlashcardSchema>;
