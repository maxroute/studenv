import type { NextRequest } from "next/server";
import { updateFlashcardSchema } from "@/lib/models/flashcard.model";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import * as flashcardService from "@/lib/services/flashcard.service";
import { handleFlashcardRequest } from "../handle";

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return handleFlashcardRequest(request, async (user) => {
    await requireJsonContentType(request);
    return flashcardService.updateFlashcard(user.id, validateId(params.id), await validateBody(request, updateFlashcardSchema));
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleFlashcardRequest(request, async (user) => {
    const id = validateId(params.id);
    await flashcardService.deleteFlashcard(user.id, id);
    return { id };
  });
}
