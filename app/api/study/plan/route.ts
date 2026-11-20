import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { studyPlanRequestSchema } from "@/lib/models/study.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import { study } from "@/lib/services/study.server";

export const runtime = "nodejs";
/** The model chain may try up to three providers. */
export const maxDuration = 60;

/** Plans study sessions for a goal from the user's pages, PDFs or videos. Saves nothing; uses one daily Rangan question. */
export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await study.makePlan(user.id, await validateBody(request, studyPlanRequestSchema)));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
