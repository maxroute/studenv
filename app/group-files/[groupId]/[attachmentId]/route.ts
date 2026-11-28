import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";
import { getFileStream, getObjectMetadata } from "@/lib/storage/s3";
import { fileResponseHeaders, parseByteRange } from "@/lib/study-groups/file-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A file shared in a group chat, for the group's members. `?download=1` saves
 * it instead of opening it. Served from this app (not a signed storage link,
 * which expired after an hour) and outside /api, so a video or PDF reading
 * in many range requests doesn't use up the API request limit.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string; attachmentId: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.groupId);
    const attachmentId = validateId(params.attachmentId);
    const attachment = await studyGroupService.getStudyGroupAttachmentFile(
      user.id,
      groupId,
      attachmentId,
    );

    const metadata = await getObjectMetadata(attachment.storageKey).catch(() => null);
    const size = metadata?.ContentLength;
    if (size === undefined || size === null) {
      return apiError("File not found.", 404);
    }

    const { contentType, disposition } = fileResponseHeaders({
      name: attachment.name,
      mimeType: attachment.mimeType,
      download: request.nextUrl.searchParams.get("download") === "1",
    });
    const range = parseByteRange(request.headers.get("range"), size);

    if (range.kind === "unsatisfiable") {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const start = range.kind === "partial" ? range.start : 0;
    const end = range.kind === "partial" ? range.end : size - 1;
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Content-Length": String(size === 0 ? 0 : end - start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
      // Only types that can't run scripts open in the tab (fileResponseHeaders); never guess another.
      "X-Content-Type-Options": "nosniff",
    });

    if (size === 0) {
      return new Response(null, { status: 200, headers });
    }

    if (range.kind === "partial") {
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    }

    const stream = await getFileStream(
      attachment.storageKey,
      range.kind === "partial" ? { start, end } : undefined,
    );
    const body =
      stream instanceof Readable ? Readable.toWeb(stream) : (stream as unknown as ReadableStream);

    return new Response(body as unknown as BodyInit, {
      status: range.kind === "partial" ? 206 : 200,
      headers,
    });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
