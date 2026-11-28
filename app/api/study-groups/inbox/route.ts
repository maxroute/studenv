import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import * as studyGroupService from "@/lib/services/study-group.service";

export const dynamic = "force-dynamic";

/** Unread counts and newest messages for the signed-in student's groups. */
export async function GET() {
  try {
    const user = await requireAuth();
    return apiSuccess(await studyGroupService.listStudyGroupInbox(user.id));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
