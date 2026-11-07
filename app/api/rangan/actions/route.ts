import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { ranganActionSchema } from "@/lib/models/learning.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { checkRateLimit, ranganRateLimiter } from "@/lib/security/rateLimit";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as ranganService from "@/lib/services/rangan.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(ranganRateLimiter, getRateLimitIdentifier(request, user.id));
    const input = await validateBody(request, ranganActionSchema);
    const result = await ranganService.performRanganAction(user.id, user.plan, input);
    return apiSuccess(result, { status: input.action === "save_to_shelf" || input.action === "create_revision_task" ? 201 : 200 });
  } catch (error) {
    const result = getErrorResponse(error);
    return apiError(result.message, result.status, result.details);
  }
}
