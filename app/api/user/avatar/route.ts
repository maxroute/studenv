import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import {
  getErrorResponse,
  getRateLimitIdentifier,
  getRequestContext,
} from "@/lib/security/request";
import { avatarContentType, imageExtension } from "@/lib/storage/avatar";
import { uploadBuffer } from "@/lib/storage/s3";
import * as authService from "@/lib/services/auth.service";

export const runtime = "nodejs";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError("Select an image to upload.", 400);
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return apiError("Profile photos must be 5 MB or smaller.", 400);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = imageExtension(bytes);

    if (!extension) {
      return apiError("Upload a JPG, PNG, GIF, or WebP image.", 400);
    }

    const filename = `${user.id}-${randomUUID()}.${extension}`;
    // Stored with the other uploads: the live host can't write to its own folders.
    await uploadBuffer(`avatars/${filename}`, bytes, avatarContentType(extension));

    const profile = await authService.updateAvatar(
      user.id,
      `/avatars/${filename}`,
      getRequestContext(request),
    );

    return apiSuccess(profile);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
