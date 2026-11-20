import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { studyRequestSchema } from "@/lib/models/study.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import { study } from "@/lib/services/study.server";

export const runtime = "nodejs";
/** The model chain may try up to three providers. */
export const maxDuration = 60;

/** Makes a multiple-choice quiz from one of the user's pages, PDFs or videos. Uses one daily Rangan question. */
export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await study.makeQuiz(user.id, await validateBody(request, studyRequestSchema)));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
