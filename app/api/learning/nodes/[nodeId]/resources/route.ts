import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createCourseResourceSchema } from "@/lib/models/learning.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import * as learningService from "@/lib/services/learning.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { nodeId: string } }) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const input = await validateBody(request, createCourseResourceSchema);
    return apiSuccess(await learningService.createCourseResource(user.id, user.plan, validateId(params.nodeId), input), { status: 201 });
  } catch (error) {
    const result = getErrorResponse(error);
    return apiError(result.message, result.status, result.details);
  }
}
