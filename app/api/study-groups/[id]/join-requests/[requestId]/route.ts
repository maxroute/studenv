import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { manageStudyGroupJoinRequestSchema } from "@/lib/models/study-group.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { validateBody, validateId } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; requestId: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    const requestId = validateId(params.requestId);
    const body = await validateBody(request, manageStudyGroupJoinRequestSchema);
    const group = await studyGroupService.manageStudyGroupJoinRequest(
      user.id,
      groupId,
      requestId,
      body,
    );
    return apiSuccess(group);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
