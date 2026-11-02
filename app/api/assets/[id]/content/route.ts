import { Readable } from "node:stream";
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
        const metadata = await storageService.getObjectMetadata(
          latestRevision.storageKey,
        );

        const fileSize = metadata.ContentLength;

        if (fileSize === undefined || fileSize === null) {
          throw new Error("Could not determine stored file size.");
        }

        const rangeHeader = req.headers.get("range");
        let start = 0;
        let end = fileSize - 1;
        let status = 200;

        if (rangeHeader) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);

          if (!match || fileSize === 0) {
            return new NextResponse(null, {
              status: 416,
              headers: {
                "Content-Range": `bytes */${fileSize}`,
              },
            });
          }

          if (match[1] === "") {
            const suffixLength = Number(match[2]);

            if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
              return new NextResponse(null, {
                status: 416,
                headers: {
                  "Content-Range": `bytes */${fileSize}`,
                },
              });
            }

            start = Math.max(fileSize - suffixLength, 0);
          } else {
            start = Number(match[1]);
            end = match[2] === "" ? fileSize - 1 : Number(match[2]);
          }

          if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            start >= fileSize ||
            end < start
          ) {
            return new NextResponse(null, {
              status: 416,
              headers: {
                "Content-Range": `bytes */${fileSize}`,
              },
            });
          }

          end = Math.min(end, fileSize - 1);
          status = 206;
        }

        const stream = await storageService.getFileStream(
          latestRevision.storageKey,
          rangeHeader ? { start, end } : undefined,
        );

        const headers = new Headers({
          "Content-Type": metadata.ContentType || inferContentType(asset),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=300",
          "Content-Length": String(end - start + 1),
        });

        if (status === 206) {
          headers.set(
            "Content-Range",
            `bytes ${start}-${end}/${fileSize}`,
          );
        }

        const webStream =
          stream instanceof Readable
            ? Readable.toWeb(stream)
            : (stream as ReadableStream);

        return new NextResponse(
          webStream as unknown as BodyInit,
          { status, headers },
        );
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

      const upstream = await fetch(resolvedSourceUrl, {
        headers: req.headers.get("range")
          ? { Range: req.headers.get("range")! }
          : undefined,
      });

      if (!upstream.ok && upstream.status !== 416) {
        return NextResponse.json(
          { error: "Failed to fetch source media" },
          { status: upstream.status },
        );
      }

      const headers = new Headers({
        "Content-Type":
          upstream.headers.get("content-type") || inferContentType(asset),
        "Cache-Control": "private, max-age=300",
      });

      for (const header of [
        "content-length",
        "content-range",
        "accept-ranges",
      ]) {
        const value = upstream.headers.get(header);
        if (value) headers.set(header, value);
      }

      return new NextResponse(
        upstream.body as unknown as BodyInit,
        {
          status: upstream.status,
          headers,
        },
      );

    }

    return NextResponse.json({ error: "No media content available" }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load media content" },
      { status: error.status || 500 },
    );
  }
}
