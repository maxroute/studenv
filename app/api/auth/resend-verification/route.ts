import { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@/lib/models/user.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { verificationResendLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as authService from "@/lib/services/auth.service";
import { getPublicAppUrl } from "@/lib/config/app-url";

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    await checkRateLimit(verificationResendLimiter, getRateLimitIdentifier(request));
    const body = await validateBody(request, forgotPasswordSchema);
    const result = await authService.resendVerificationEmail(body.email, getPublicAppUrl(request.nextUrl.origin));
    return apiSuccess(result);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
