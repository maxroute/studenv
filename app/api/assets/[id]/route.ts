import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getRequestContext } from "@/lib/security/request";
import * as assetService from "@/lib/services/asset.service";
import * as storageService from "@/lib/storage/s3";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const asset = await assetService.getAsset(params.id);

    if (asset.ownerId !== user.id) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const latestRevision = asset.revisions[0] ?? null;
    const contentUrl =
      (asset.kind === "video" || asset.kind === "audio" || asset.kind === "webpage") && asset.sourceUrl
        ? asset.sourceUrl
        : (asset.kind === "image" || asset.kind === "audio" || asset.kind === "video") &&
            latestRevision?.storageKey
          ? await storageService.getDownloadUrl(latestRevision.storageKey)
          : `/api/assets/${asset.id}/content`;

    return NextResponse.json({
      id: asset.id,
      title: asset.title,
      kind: asset.kind,
      mimeType: asset.mimeType,
      status: asset.status,
      sourceUrl: asset.sourceUrl,
      sourceHost: asset.sourceHost,
      currentRevisionId: asset.currentRevisionId ?? latestRevision?.id ?? null,
      contentUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load asset" },
      { status: error.status || 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const context = getRequestContext(req);

    const deleted = await assetService.deleteAsset(params.id, user.id, context);
    return apiSuccess({ deleted });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
