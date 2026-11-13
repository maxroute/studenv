import type { NextRequest } from "next/server";
import { z } from "zod";
import { createFlashcardSchema } from "@/lib/models/flashcard.model";
import { REF_MAX_LENGTH } from "@/lib/refs/ref-grammar";
import { getQueryObject } from "@/lib/security/request";
import { requireJsonContentType, validateBody, validateQuery } from "@/lib/security/validate";
import * as flashcardService from "@/lib/services/flashcard.service";
import { handleFlashcardRequest } from "./handle";

const listQuery = z.object({ source: z.string().max(REF_MAX_LENGTH).optional() }).strict();

/** The caller's cards, optionally only those made from `?source=<ref>`. */
export async function GET(request: NextRequest) {
  return handleFlashcardRequest(request, (user) => {
    const { source } = validateQuery(getQueryObject(request), listQuery);
    return flashcardService.listFlashcards(user.id, source);
  });
}

export async function POST(request: NextRequest) {
  return handleFlashcardRequest(
    request,
    async (user) => {
      await requireJsonContentType(request);
      return flashcardService.createFlashcard(user.id, await validateBody(request, createFlashcardSchema));
    },
    { status: 201 },
  );
}
