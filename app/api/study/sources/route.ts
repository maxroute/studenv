import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { listStudySources } from "@/lib/repositories/study.repository";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";

export const dynamic = "force-dynamic";

/** The signed-in user's pages, PDFs and videos that have text to study from. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await listStudySources(user.id));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
