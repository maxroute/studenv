import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import { ranganBoards } from "@/lib/services/rangan-board.server";
import { createMapBoardSchema } from "@/lib/services/rangan-board.service";

export const runtime = "nodejs";

/** Creates a new board from a map Rangan drafted and the student chose to create. No daily question is used. */
export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await ranganBoards.createMapBoard(user.id, await validateBody(request, createMapBoardSchema)), { status: 201 });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
