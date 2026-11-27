import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { validateQuery } from "@/lib/security/validate";
import { focusHistoryQuerySchema } from "@/lib/models/planner.model";
import * as plannerService from "@/lib/services/planner.service";

export const dynamic = "force-dynamic";

// ─── GET /api/planner/history?from&to — Focus time for the study calendar ───
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const query = validateQuery(Object.fromEntries(request.nextUrl.searchParams), focusHistoryQuerySchema);
    return apiSuccess(await plannerService.listFocusHistory(user.id, new Date(query.from), new Date(query.to)));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
