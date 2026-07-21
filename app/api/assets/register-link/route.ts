import { NextRequest } from "next/server";
import { z } from "zod";
import { MediaAssetKind, MediaAssetOrigin } from "@prisma/client";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import {
  getErrorResponse,
  getRateLimitIdentifier,
  getRequestContext,
} from "@/lib/security/request";
import {
  requireJsonContentType,
  validateBody,
} from "@/lib/security/validate";
import * as assetService from "@/lib/services/asset.service";
import { inferAssetFromExternalUrl } from "@/lib/utils/asset-links";

const registerLinkSchema = z.object({
  url: z.string().min(1).max(4000),
  title: z.string().trim().max(500).optional(),
});

async function probeContentType(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return response.headers.get("content-type");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));

    const body = await validateBody(request, registerLinkSchema);
    const context = getRequestContext(request);
    const contentType = await probeContentType(body.url);
    const inferred = inferAssetFromExternalUrl(body.url, {
      contentType,
      title: body.title,
    });

    const asset = await assetService.createAsset({
      ownerId: user.id,
      kind: MediaAssetKind[inferred.kind],
      origin: MediaAssetOrigin.external_url,
      title: inferred.title,
      mimeType: inferred.mimeType,
      sourceUrl: inferred.normalizedUrl,
      sourceHost: inferred.sourceHost,
    }, context);

    return apiSuccess({
      assetId: asset.id,
      kind: asset.kind,
      title: asset.title,
      sourceUrl: asset.sourceUrl,
    }, { status: 201 });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
