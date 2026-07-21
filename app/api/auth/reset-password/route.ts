import { NextRequest } from "next/server";
import { resetPasswordSchema } from "@/lib/models/user.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getRequestContext } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as authService from "@/lib/services/auth.service";

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const body = await validateBody(request, resetPasswordSchema);
    const user = await authService.resetPassword(
      body.token,
      body.password,
      getRequestContext(request),
    );
    return apiSuccess(user);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
