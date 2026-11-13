import type { NextRequest } from "next/server";
import { reviewFlashcardSchema } from "@/lib/models/flashcard.model";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import * as flashcardService from "@/lib/services/flashcard.service";
import { handleFlashcardRequest } from "../../handle";

type RouteContext = { params: { id: string } };

/** Records an answer (1 Again … 4 Easy) and returns when the card is due next. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleFlashcardRequest(request, async (user) => {
    await requireJsonContentType(request);
    return flashcardService.reviewFlashcard(user.id, validateId(params.id), await validateBody(request, reviewFlashcardSchema));
  });
}
