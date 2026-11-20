import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { PdfPageTextBatchSchema } from "@/lib/models/asset.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import * as assetService from "@/lib/services/asset.service";

export const runtime = "nodejs";

/** Saves a batch of the page text the browser read from the user's uploaded PDF. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const assetId = validateId(params.id);
    const batch = await validateBody(request, PdfPageTextBatchSchema);
    return apiSuccess(await assetService.savePdfPageText(user.id, assetId, batch));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
