import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { aiGenerateSchema } from "@/lib/models/ai.model";
import * as aiRepository from "@/lib/repositories/ai.repository";
import { apiError } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import { createAiGenerateService } from "@/lib/services/ai-generate.service";
import {
  chatWithDocument,
  generateFlashcards,
  generateQuiz,
  generateSummary,
} from "@/lib/services/ai.service";

const runAiGenerate = createAiGenerateService({
  isAssetOwnedBy: aiRepository.isAssetOwnedBy,
  saveSummary: aiRepository.saveSummary,
  findSavedFlashcards: aiRepository.findSavedFlashcards,
  saveFlashcardsIfNone: aiRepository.saveFlashcardsIfNone,
  replaceRegenerableFlashcards: aiRepository.replaceRegenerableFlashcards,
  generateSummary,
  generateFlashcards,
  generateQuiz,
  chatWithDocument,
});

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const input = await validateBody(request, aiGenerateSchema);
    // Success bodies keep their existing shapes ({ summary }, { flashcards }, …).
    return NextResponse.json(await runAiGenerate(user.id, input));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
