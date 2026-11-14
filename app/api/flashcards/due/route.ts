import type { NextRequest } from "next/server";
import * as flashcardService from "@/lib/services/flashcard.service";
import { handleFlashcardRequest } from "../handle";

/** Cards due for review now (oldest due first, then new cards) and how many are due in total. */
export async function GET(request: NextRequest) {
  return handleFlashcardRequest(request, (user) => flashcardService.dueFlashcards(user.id));
}
