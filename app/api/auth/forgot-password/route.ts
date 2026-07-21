import { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@/lib/models/user.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { passwordResetLimiter, checkRateLimit } from "@/lib/security/rateLimit";
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
    await checkRateLimit(passwordResetLimiter, getRateLimitIdentifier(request));
    const body = await validateBody(request, forgotPasswordSchema);
    const result = await authService.requestPasswordReset(
      body.email,
      getRequestContext(request),
    );
    return apiSuccess(result);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
