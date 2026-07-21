import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; userId: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    const memberUserId = validateId(params.userId);
    const group = await studyGroupService.removeStudyGroupMember(user.id, groupId, memberUserId);
    return apiSuccess(group);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
