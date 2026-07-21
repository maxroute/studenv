import { NextRequest } from "next/server";
import { changePasswordSchema } from "@/lib/models/user.model";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { authRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import {
  getErrorResponse,
  getRateLimitIdentifier,
  getRequestContext,
} from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as authService from "@/lib/services/auth.service";

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(authRateLimiter, getRateLimitIdentifier(request, user.id));
    const body = await validateBody(request, changePasswordSchema);
    const result = await authService.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
      getRequestContext(request),
    );
    return apiSuccess(result);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
