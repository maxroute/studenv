import { NextRequest } from "next/server";
import { verifyTokenSchema } from "@/lib/models/user.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getRequestContext } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as authService from "@/lib/services/auth.service";

// Email security scanners may prefetch GET links. A GET must never consume
// a one-time verification token or change account state.
export async function GET() {
  return apiSuccess({ requiresConfirmation: true });
}

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const body = await validateBody(request, verifyTokenSchema);
    const user = await authService.verifyEmail(
      body.token,
      getRequestContext(request),
    );
    return apiSuccess(user);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
