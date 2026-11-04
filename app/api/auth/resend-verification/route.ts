import { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@/lib/models/user.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as authService from "@/lib/services/auth.service";

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const body = await validateBody(request, forgotPasswordSchema);
    const result = await authService.resendVerificationEmail(body.email, request.nextUrl.origin);
    return apiSuccess(result);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
