import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { updateCourseNodeSchema } from "@/lib/models/learning.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import * as learningService from "@/lib/services/learning.service";

export const dynamic = "force-dynamic";
type Context = { params: { nodeId: string } };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const input = await validateBody(request, updateCourseNodeSchema);
    return apiSuccess(await learningService.updateCourseNode(user.id, validateId(params.nodeId), input));
  } catch (error) {
    const result = getErrorResponse(error);
    return apiError(result.message, result.status, result.details);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await learningService.deleteCourseNode(user.id, validateId(params.nodeId)));
  } catch (error) {
    const result = getErrorResponse(error);
    return apiError(result.message, result.status, result.details);
  }
}
