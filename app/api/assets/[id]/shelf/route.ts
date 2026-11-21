import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import { shelfFiles } from "@/lib/services/shelf-files.server";

/** Puts one of the user's vault files on the Shelf (once) and returns its Shelf item. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await shelfFiles.shelve(user.id, user.plan, validateId(params.id)));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
