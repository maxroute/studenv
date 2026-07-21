import { requireAuth } from "@/lib/auth/session";
import { issueStudyGroupSocketToken } from "@/lib/realtime/study-group-socket-auth";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    await studyGroupService.getStudyGroup(user.id, groupId);

    const token = issueStudyGroupSocketToken({
      groupId,
      userId: user.id,
      name: user.name ?? null,
      username: user.username ?? null,
    });

    return apiSuccess({ token });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
