import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { ranganSearchSchema } from "@/lib/models/rangan.model";
import { apiError } from "@/lib/security/headers";
import { checkRateLimit, searchRateLimiter } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { validateQuery } from "@/lib/security/validate";
import { ranganIndex } from "@/lib/services/rangan-index.server";

export const dynamic = "force-dynamic";

/** Searches the signed-in user's own library. Does not use the daily question allowance. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(searchRateLimiter, getRateLimitIdentifier(request, user.id));
    const query = validateQuery(Object.fromEntries(request.nextUrl.searchParams), ranganSearchSchema);
    const { results, mode } = await ranganIndex.search(user.id, query.q, query.limit);
    return NextResponse.json({
      mode,
      results: results.map(({ content: _content, ...result }) => result),
    });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
