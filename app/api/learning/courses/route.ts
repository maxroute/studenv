import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createCourseSchema } from "@/lib/models/learning.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as learningService from "@/lib/services/learning.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await learningService.listCourses(user.id));
  } catch (error) {
    const result = getErrorResponse(error);
    return apiError(result.message, result.status, result.details);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const input = await validateBody(request, createCourseSchema);
    return apiSuccess(await learningService.createCourse(user.id, input), { status: 201 });
  } catch (error) {
    const result = getErrorResponse(error);
    return apiError(result.message, result.status, result.details);
  }
}
