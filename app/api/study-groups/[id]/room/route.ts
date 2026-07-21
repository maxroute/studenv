import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { updateStudyRoomStateSchema } from "@/lib/models/study-group.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { validateBody, validateId } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    const body = await validateBody(request, updateStudyRoomStateSchema);
    const group = await studyGroupService.updateStudyGroupRoomState(user.id, groupId, body);
    return apiSuccess(group);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
