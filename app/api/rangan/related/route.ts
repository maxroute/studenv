import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { parseRef } from "@/lib/refs/ref-grammar";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { ranganIndex } from "@/lib/services/rangan-index.server";

export const dynamic = "force-dynamic";

/**
 * "Related in your library" for a page (`note:<id>`) or a PDF or video
 * (`asset:<id>`). Uses saved meaning vectors only: no daily question.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const raw = request.nextUrl.searchParams.get("ref") ?? "";
    const ref = raw.length <= 420 ? parseRef(raw) : null;
    if (!ref || (ref.type !== "note" && ref.type !== "asset")) return apiError("Choose a page, PDF or video.", 400);
    return apiSuccess(await ranganIndex.related(user.id, { type: ref.type, id: ref.id }));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
