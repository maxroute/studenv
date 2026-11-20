import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { ranganExploreSchema } from "@/lib/models/rangan.model";
import { apiError } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import { rangan } from "@/lib/services/rangan.server";

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const input = await validateBody(request, ranganExploreSchema);
    return NextResponse.json(await rangan.explore(user.id, input));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
