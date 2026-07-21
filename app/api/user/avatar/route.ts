import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import {
  getErrorResponse,
  getRateLimitIdentifier,
  getRequestContext,
} from "@/lib/security/request";
import * as authService from "@/lib/services/auth.service";

export const runtime = "nodejs";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError("Select an image to upload.", 400);
    }

    const extension = ALLOWED_IMAGE_TYPES.get(file.type);

    if (!extension) {
      return apiError("Upload a JPG, PNG, GIF, or WebP image.", 400);
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return apiError("Profile photos must be 5 MB or smaller.", 400);
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
    await mkdir(uploadDir, { recursive: true });

    const filename = `${user.id}-${randomUUID()}.${extension}`;
    const filePath = path.join(uploadDir, filename);
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    await writeFile(filePath, fileBuffer);

    const profile = await authService.updateAvatar(
      user.id,
      `/uploads/avatars/${filename}`,
      getRequestContext(request),
    );

    return apiSuccess(profile);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
