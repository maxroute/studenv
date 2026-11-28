import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";
import { avatarContentType, imageExtension } from "@/lib/storage/avatar";
import { MAX_GROUP_PHOTO_SIZE } from "@/lib/study-groups/group-photo";

export const runtime = "nodejs";

/** Sets the group's picture (owner only). */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError("Select an image to upload.", 400);
    }

    if (file.size > MAX_GROUP_PHOTO_SIZE) {
      return apiError("Group photos must be 5 MB or smaller.", 400);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // The type the bytes really are, whatever the upload claims.
    const extension = imageExtension(bytes);

    if (!extension) {
      return apiError("Upload a JPG, PNG, GIF, or WebP image.", 400);
    }

    const group = await studyGroupService.setStudyGroupPhoto(user.id, groupId, {
      bytes,
      extension,
      contentType: avatarContentType(extension),
    });
    return apiSuccess(group);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

/** Removes the group's picture (owner only). */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    const group = await studyGroupService.removeStudyGroupPhoto(user.id, groupId);
    return apiSuccess(group);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
