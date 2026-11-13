import {
  generatedFlashcardSchema,
  type AiGenerateInput,
  type GeneratedFlashcard,
} from "@/lib/models/ai.model";

/** Storage and model calls the service needs; injected so the rules are testable without a database. */
export type AiGenerateDeps = {
  isAssetOwnedBy: (assetId: string, ownerId: string) => Promise<boolean>;
  saveSummary: (assetId: string, summary: string, transcript: string) => Promise<void>;
  findSavedFlashcards: (assetId: string) => Promise<GeneratedFlashcard[]>;
  saveFlashcardsIfNone: (
    assetId: string,
    transcript: string,
    cards: GeneratedFlashcard[],
  ) => Promise<{ saved: boolean; flashcards: GeneratedFlashcard[] }>;
  generateSummary: (text: string) => Promise<string>;
  generateFlashcards: (text: string) => Promise<unknown>;
  generateQuiz: (text: string) => Promise<unknown[]>;
  chatWithDocument: (
    text: string,
    userMessage: string,
    history: Array<{ role: string; content: string }>,
  ) => Promise<string>;
};

export type AiGenerateResult =
  | { summary: string }
  | { flashcards: GeneratedFlashcard[] }
  | { quiz: unknown[] }
  | { response: string };

function notFound() {
  return Object.assign(new Error("Asset not found."), { status: 404 });
}

/** Keeps only well-formed cards from the model's output. */
export function normalizeGeneratedFlashcards(output: unknown): GeneratedFlashcard[] {
  if (!Array.isArray(output)) return [];
  return output.flatMap((entry) => {
    const parsed = generatedFlashcardSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function createAiGenerateService(deps: AiGenerateDeps) {
  return async function runAiGenerate(userId: string, input: AiGenerateInput): Promise<AiGenerateResult> {
    switch (input.action) {
      case "summary": {
        // Ownership is checked before the model is called, so a foreign asset
        // costs nothing and reveals nothing.
        if (input.assetId && !(await deps.isAssetOwnedBy(input.assetId, userId))) throw notFound();
        const summary = await deps.generateSummary(input.text);
        if (input.assetId) await deps.saveSummary(input.assetId, summary, input.text);
        return { summary };
      }

      case "flashcards": {
        if (!input.assetId) {
          return { flashcards: normalizeGeneratedFlashcards(await deps.generateFlashcards(input.text)) };
        }
        if (!(await deps.isAssetOwnedBy(input.assetId, userId))) throw notFound();

        // Cards are saved once per asset. Generating again returns the saved
        // set instead of appending another one; replacing unreviewed cards
        // arrives with the flashcard review model.
        const saved = await deps.findSavedFlashcards(input.assetId);
        if (saved.length > 0) return { flashcards: saved };

        const cards = normalizeGeneratedFlashcards(await deps.generateFlashcards(input.text));
        const result = await deps.saveFlashcardsIfNone(input.assetId, input.text, cards);
        return { flashcards: result.flashcards };
      }

      case "quiz":
        return { quiz: await deps.generateQuiz(input.text) };

      case "chat":
        return { response: await deps.chatWithDocument(input.text, input.userMessage, input.history) };
    }
  };
}
