import { NextRequest } from "next/server";
import { signupSchema } from "@/lib/models/user.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getRequestContext } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as authService from "@/lib/services/auth.service";
import { getPublicAppUrl } from "@/lib/config/app-url";

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const body = await validateBody(request, signupSchema);
    const result = await authService.signup(body, getRequestContext(request), getPublicAppUrl(request.nextUrl.origin));
    return apiSuccess(result, { status: 201 });
  } catch (error) {
    console.error("Signup error:", error);
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
