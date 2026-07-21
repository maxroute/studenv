import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createStudyGroupMessageSchema } from "@/lib/models/study-group.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { validateBody, validateId } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";

const MAX_TOTAL_ATTACHMENT_SIZE = 150 * 1024 * 1024;
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    const messages = await studyGroupService.listStudyGroupMessages(user.id, groupId);
    return apiSuccess(messages);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    const contentType = request.headers.get("content-type") || "";
    let body: { content?: string };
    let attachments:
      | Array<{
          name: string;
          mimeType: string;
          sizeBytes: number;
          buffer: Buffer;
        }>
      | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = {
        content: String(formData.get("content") ?? ""),
      };

      const files = formData
        .getAll("files")
        .filter((entry): entry is File => entry instanceof File);
      const legacyFile = formData.get("file");
      const uploadedFiles =
        files.length > 0
          ? files
          : legacyFile instanceof File
            ? [legacyFile]
            : [];

      const totalSize = uploadedFiles.reduce((sum, file) => sum + file.size, 0);
      if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE) {
        return apiError("Attachments must stay under 150 MB total per message.", 400);
      }

      if (uploadedFiles.length > 0) {
        attachments = await Promise.all(
          uploadedFiles.map(async (file) => ({
            name: file.name || "shared-file",
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            buffer: Buffer.from(await file.arrayBuffer()),
          })),
        );
      }
    } else {
      body = await validateBody(request, createStudyGroupMessageSchema);
    }

    const parsed = createStudyGroupMessageSchema.parse(body);
    const message = await studyGroupService.createStudyGroupMessage(
      user.id,
      groupId,
      parsed,
      attachments,
    );
    return apiSuccess(message);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
