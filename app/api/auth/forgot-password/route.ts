import { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@/lib/models/user.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { checkRateLimit, passwordResetEmailLimiter, passwordResetIpLimiter } from "@/lib/security/rateLimit";
import { emailLimitKey } from "@/lib/security/email-key";
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
    await checkRateLimit(passwordResetIpLimiter, getRateLimitIdentifier(request));
    const body = await validateBody(request, forgotPasswordSchema);
    // The same limit for any address, so a refusal says nothing about whether it has an account.
    await checkRateLimit(passwordResetEmailLimiter, emailLimitKey(body.email));
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
