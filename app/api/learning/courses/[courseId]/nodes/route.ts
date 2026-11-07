import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createCourseNodeSchema } from "@/lib/models/learning.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import * as learningService from "@/lib/services/learning.service";

export const dynamic = "force-dynamic";
type Context = { params: { courseId: string } };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await learningService.listCourseNodes(user.id, validateId(params.courseId)));
  } catch (error) {
    const result = getErrorResponse(error);
    return apiError(result.message, result.status, result.details);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const input = await validateBody(request, createCourseNodeSchema);
    return apiSuccess(await learningService.createCourseNode(user.id, validateId(params.courseId), input), { status: 201 });
  } catch (error) {
    const result = getErrorResponse(error);
    return apiError(result.message, result.status, result.details);
  }
}
