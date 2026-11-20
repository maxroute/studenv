import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { searchWikipedia } from "@/lib/web/wikipedia";

export const dynamic = "force-dynamic";

/**
 * Wikipedia's articles for a short query (a concept missing from the
 * student's library). Only the query is sent to Wikipedia; no model is
 * asked, so no daily question is used.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (!query || query.length > 200) return apiError("Say what to look up.", 400);
    try {
      return apiSuccess(await searchWikipedia(query, { limit: 2 }));
    } catch {
      return apiError("Wikipedia couldn't be reached. Please try again in a minute.", 502);
    }
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
