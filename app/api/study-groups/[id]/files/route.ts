import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";

/** The files shared in the group's chat, newest first (members only). */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    const files = await studyGroupService.listStudyGroupFiles(user.id, groupId);
    return apiSuccess(files);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
