import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import * as assetService from "@/lib/services/asset.service";
import * as storageService from "@/lib/storage/s3";

function inferContentType(asset: Awaited<ReturnType<typeof assetService.getAsset>>) {
  if (asset.mimeType) return asset.mimeType;
  if (asset.kind === "pdf") return "application/pdf";
  if (asset.kind === "video") return "video/mp4";
  if (asset.kind === "audio") return "audio/mpeg";
  return "application/octet-stream";
}

function resolveAssetSourceUrl(sourceUrl: string, requestUrl: string) {
  try {
    return new URL(sourceUrl).toString();
  } catch {
    try {
      return new URL(sourceUrl, requestUrl).toString();
    } catch {
      return null;
    }
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const asset = await assetService.getAsset(params.id);

    if (asset.ownerId !== user.id) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const latestRevision = asset.currentRevisionId
      ? await assetService.getRevisionDetails(asset.currentRevisionId)
      : asset.revisions[0]
        ? await assetService.getRevisionDetails(asset.revisions[0].id)
        : null;

    if (latestRevision?.storageKey) {
      try {
        const buffer = await storageService.getFileBuffer(latestRevision.storageKey);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": inferContentType(asset),
            "Cache-Control": "private, max-age=300",
          },
        });
      } catch (error) {
        console.warn(
          `Falling back to sourceUrl for asset ${asset.id} because stored revision content could not be loaded.`,
          error,
        );
      }
    }

    if (asset.sourceUrl) {
      const resolvedSourceUrl = resolveAssetSourceUrl(asset.sourceUrl, req.url);
      if (!resolvedSourceUrl) {
        return NextResponse.json(
          { error: "Asset source URL is invalid" },
          { status: 400 },
        );
      }

      const upstream = await fetch(resolvedSourceUrl);
      if (!upstream.ok) {
        return NextResponse.json(
          { error: "Failed to fetch source media" },
          { status: upstream.status },
        );
      }

      const arrayBuffer = await upstream.arrayBuffer();
      return new NextResponse(arrayBuffer, {
        headers: {
          "Content-Type":
            upstream.headers.get("content-type") || inferContentType(asset),
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    return NextResponse.json({ error: "No media content available" }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load media content" },
      { status: error.status || 500 },
    );
  }
}
