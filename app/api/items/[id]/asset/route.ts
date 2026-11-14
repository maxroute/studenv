import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import * as itemAssetService from "@/lib/services/item-asset.service";

type RouteContext = {
  params: { id: string };
};

/** The viewable asset for one of the user's Shelf items (created on first use). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const result = await itemAssetService.getAssetForOwnedItem(validateId(params.id), user.id);
    return apiSuccess(result);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
