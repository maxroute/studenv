import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { avatarFile } from "@/lib/storage/avatar";
import { getFileBuffer } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A profile photo, for signed-in users (it also shows beside group messages). */
export async function GET(_request: NextRequest, { params }: { params: { name: string } }) {
  try {
    await requireAuth();
    const file = avatarFile(params.name);
    if (!file) return apiError("Photo not found.", 404);
    const bytes = await getFileBuffer(file.key).catch(() => null);
    if (!bytes) return apiError("Photo not found.", 404);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.contentType,
        // The name changes with every upload, so a browser may keep it.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
