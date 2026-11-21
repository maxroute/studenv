import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { aiGenerateSchema } from "@/lib/models/ai.model";
import { RANGAN_DAILY_LIMIT } from "@/lib/models/rangan.model";
import * as aiRepository from "@/lib/repositories/ai.repository";
import * as usageRepository from "@/lib/repositories/rangan-usage.repository";
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
import { createAllowance } from "@/lib/services/rangan-allowance";

/** These tools share Rangan's models, so they share its daily allowance. */
const withQuestion = createAllowance({
  dailyLimit: RANGAN_DAILY_LIMIT,
  now: () => new Date(),
  consumeQuestion: usageRepository.consumeQuestion,
  refundQuestion: usageRepository.refundQuestion,
  getUsedCount: usageRepository.getUsedCount,
});

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
  withQuestion: (userId, run) => withQuestion(userId, () => run()),
});

export const runtime = "nodejs";
/** The model chain may try up to three providers. */
export const maxDuration = 60;

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
