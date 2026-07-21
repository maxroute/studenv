import { NextRequest } from "next/server";
import { verifyTokenSchema } from "@/lib/models/user.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getQueryObject, getRequestContext } from "@/lib/security/request";
import { validateQuery } from "@/lib/security/validate";
import * as authService from "@/lib/services/auth.service";

export async function GET(request: NextRequest) {
  try {
    const query = validateQuery(getQueryObject(request), verifyTokenSchema);
    const user = await authService.verifyEmail(
      query.token,
      getRequestContext(request),
    );
    return apiSuccess(user);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
