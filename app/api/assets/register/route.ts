import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { 
  getErrorResponse, 
  getRateLimitIdentifier,
  getRequestContext 
} from "@/lib/security/request";
import { 
  requireJsonContentType, 
  validateBody 
} from "@/lib/security/validate";
import * as assetService from "@/lib/services/asset.service";
import { z } from "zod";
import { MediaAssetKind, MediaAssetOrigin } from "@prisma/client";
import { inferUploadAssetKind } from "@/lib/utils/media-assets";

const registerAssetSchema = z.object({
  title: z.string().min(1).max(500),
  mimeType: z.string().min(1),
  storageKey: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    
    const body = await validateBody(request, registerAssetSchema);
    const context = getRequestContext(request);
    const inferredKind = inferUploadAssetKind(body.mimeType, body.title);

    if (!inferredKind) {
      return apiError("Unsupported asset type", 400);
    }

    // 1. Create the MediaAsset
    const asset = await assetService.createAsset({
      ownerId: user.id,
      kind: MediaAssetKind[inferredKind],
      origin: MediaAssetOrigin.upload,
      title: body.title,
      mimeType: body.mimeType,
    }, context);

    // 2. Create the initial AssetRevision
    const revision = await assetService.createRevision({
      assetId: asset.id,
      storageKey: body.storageKey,
      createdBy: user.id,
      sizeBytes: body.sizeBytes,
    }, context);

    // 3. Update asset with current revision
    // The service handles most of it, but we return the joint info
    return apiSuccess({
      assetId: asset.id,
      revisionId: revision.id,
    }, { status: 201 });

  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
