import { NextRequest } from "next/server";
import { updateProfileSchema } from "@/lib/models/user.model";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import {
  getErrorResponse,
  getRateLimitIdentifier,
  getRequestContext,
} from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as authService from "@/lib/services/auth.service";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const profile = await authService.getProfile(user.id);
    return apiSuccess(profile);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const body = await validateBody(request, updateProfileSchema);
    const profile = await authService.updateProfile(
      user.id,
      body,
      getRequestContext(request),
      request.nextUrl.origin,
    );
    return apiSuccess(profile);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
